/*
 * The rocket frame's whole job, once per wake.
 *
 *   mount card -> read manifest -> check budget -> fetch launch -> parse
 *   -> load layers -> render -> push to panel -> sleep panel -> deep sleep
 *
 * Everything above the panel push is the portable renderer, already proven
 * byte-identical to the Python reference. This file is the I/O around it, and
 * it is the only part that touches ESP-IDF.
 *
 * The governing rule, inherited from the kit: NEVER BLANK THE WALL. E-ink
 * holds its image with the power off, so "leave the panel alone" is always
 * available and is usually the right answer. Every failure path below takes
 * it, and every one says so out loud in the boot log, because a frame on a
 * wall is not on a USB cable.
 */
#include "rocket_app.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_timer.h"

#include "config.h"
#include "display_manager.h"
#include "sdcard.h"

#include "../renderer/rocket_poster.h"

static const char *TAG = "rocket";

#define CARD          FS_MOUNT_POINT
#define LL2_UPCOMING  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1&hide_recent_previous=true"
#define LL2_PREVIOUS  "https://ll.thespacedevs.com/2.2.0/launch/previous/?limit=1"
#define LL2_UA        "forge-rocket-poster/1.0 (+personal wall display)"
#define LL2_HOURLY_CAP 15

/*
 * Request budget, in RTC slow memory.
 *
 * The 15/hr cap is PER IP and shared with every other device in the house, so
 * this cannot actually prevent a 429 -- only our own contribution to one. It
 * lives in RTC memory rather than NVS because it survives deep sleep for free
 * and costs no flash wear; NVS would be written every wake for the life of the
 * device. A cold boot starts at zero, which is the honest state: we genuinely
 * do not know what the household has spent.
 *
 * HTTP 429 is treated as authoritative regardless of what this says.
 */
RTC_DATA_ATTR static uint32_t rtc_spent;
RTC_DATA_ATTR static int64_t  rtc_window_start_us;
RTC_DATA_ATTR static char     rtc_prev_line[128];
RTC_DATA_ATTR static uint32_t rtc_missed_windows;

/* ------------------------------------------------------------------ card */

static uint8_t *read_file(const char *path, size_t *len_out)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL) {
        return NULL;
    }
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return NULL; }
    const long n = ftell(f);
    if (n <= 0 || fseek(f, 0, SEEK_SET) != 0) { fclose(f); return NULL; }

    uint8_t *buf = heap_caps_malloc((size_t) n, MALLOC_CAP_SPIRAM);
    if (buf == NULL) { fclose(f); return NULL; }

    /* Loop on the count. FATFS f_read legitimately returns fewer bytes than
     * asked; host fread essentially never does, so code that trusts a single
     * call passes every host test and corrupts here. */
    size_t got = 0;
    while (got < (size_t) n) {
        const size_t r = fread(buf + got, 1, (size_t) n - got, f);
        if (r == 0) { break; }
        got += r;
    }
    fclose(f);
    if (got != (size_t) n) { free(buf); return NULL; }
    *len_out = got;
    return buf;
}

static bool load_layer(const char *rel, rkt_layer_t *out, uint8_t **owned)
{
    char path[256];
    snprintf(path, sizeof path, "%s/%s", CARD, rel);
    size_t len = 0;
    uint8_t *raw = read_file(path, &len);
    if (raw == NULL) {
        ESP_LOGW(TAG, "card: cannot read %s", rel);
        return false;
    }
    if (!rkt_parse_header(raw, len, &out->hdr)) {
        ESP_LOGW(TAG, "card: bad header in %s", rel);
        free(raw);
        return false;
    }
    if (len < RKT_HEADER_BYTES + rkt_payload_bytes(&out->hdr)) {
        ESP_LOGW(TAG, "card: %s truncated", rel);
        free(raw);
        return false;
    }
    out->data = raw + RKT_HEADER_BYTES;
    *owned = raw;
    return true;
}

/* scene.plate_key(), as the manifest documents it: first mood key that is a
 * substring of the lowercased destination, else "unknown". Deliberately driven
 * by the card's own list so a new mood does not need new firmware. */
static void plate_key(const cJSON *man, const char *destination,
                      const char *country, char *out, size_t out_len)
{
    char dest[128];
    size_t i = 0;
    for (; destination != NULL && destination[i] != '\0' && i + 1u < sizeof dest; ++i) {
        const unsigned char c = (unsigned char) destination[i];
        dest[i] = (char) ((c >= 'A' && c <= 'Z') ? (c - 'A' + 'a') : c);
    }
    dest[i] = '\0';

    const char *mood = "unknown";
    const cJSON *keys = cJSON_GetObjectItemCaseSensitive(man, "mood_keys");
    const cJSON *k = NULL;
    cJSON_ArrayForEach(k, keys) {
        if (cJSON_IsString(k) && k->valuestring != NULL &&
            strstr(dest, k->valuestring) != NULL) {
            mood = k->valuestring;
            break;
        }
    }

    char cc[8];
    size_t j = 0;
    for (; country != NULL && country[j] != '\0' && j + 1u < sizeof cc; ++j) {
        const unsigned char c = (unsigned char) country[j];
        cc[j] = (char) ((c >= 'A' && c <= 'Z') ? (c - 'A' + 'a') : c);
    }
    cc[j] = '\0';
    if (cc[0] == '\0') { snprintf(cc, sizeof cc, "xxx"); }

    const cJSON *sv = cJSON_GetObjectItemCaseSensitive(man, "style_version");
    snprintf(out, out_len, "%s-%s-v%d", mood, cc,
             cJSON_IsNumber(sv) ? sv->valueint : 2);
}

/* ingest.load_tonal()'s rule: lowercase, spaces to hyphens. */
static void family_key(const char *family, char *out, size_t out_len)
{
    size_t i = 0;
    for (; family != NULL && family[i] != '\0' && i + 1u < out_len; ++i) {
        const unsigned char c = (unsigned char) family[i];
        out[i] = (c == ' ') ? '-'
               : (char) ((c >= 'A' && c <= 'Z') ? (c - 'A' + 'a') : c);
    }
    out[i] = '\0';
}

/* ------------------------------------------------------------------ net */

typedef struct { char *buf; size_t len; size_t cap; } body_t;

static esp_err_t on_http(esp_http_client_event_t *e)
{
    if (e->event_id != HTTP_EVENT_ON_DATA || e->user_data == NULL) {
        return ESP_OK;
    }
    body_t *b = (body_t *) e->user_data;
    if (b->len + (size_t) e->data_len + 1u > b->cap) {
        return ESP_OK;                     /* over budget: truncate, parse fails */
    }
    memcpy(b->buf + b->len, e->data, (size_t) e->data_len);
    b->len += (size_t) e->data_len;
    b->buf[b->len] = '\0';
    return ESP_OK;
}

/* Returns the HTTP status, or -1 on transport failure. */
static int fetch(const char *url, char *out, size_t cap)
{
    body_t body = { .buf = out, .len = 0, .cap = cap };
    out[0] = '\0';
    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 20000,
        .user_agent = LL2_UA,
        .event_handler = on_http,
        .user_data = &body,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t c = esp_http_client_init(&cfg);
    if (c == NULL) { return -1; }
    const esp_err_t err = esp_http_client_perform(c);
    const int status = (err == ESP_OK) ? esp_http_client_get_status_code(c) : -1;
    esp_http_client_cleanup(c);
    return status;
}

/* ------------------------------------------------------------------ parse */

static const char *jstr(const cJSON *o, const char *k)
{
    const cJSON *v = cJSON_GetObjectItemCaseSensitive(o, k);
    return (cJSON_IsString(v) && v->valuestring != NULL) ? v->valuestring : NULL;
}

static void upper_into(char *dst, size_t cap, const char *src)
{
    size_t i = 0;
    for (; src != NULL && src[i] != '\0' && i + 1u < cap; ++i) {
        const unsigned char c = (unsigned char) src[i];
        dst[i] = (char) ((c >= 'a' && c <= 'z') ? (c - 'a' + 'A') : c);
    }
    dst[i] = '\0';
}

/*
 * LL2 2.2.0 -> the flat shape the renderer wants, matching launch.normalize().
 * A field we cannot read is left empty and rendered as a gap; nothing here
 * guesses.
 */
static bool parse_launch(const char *json, rocket_record_t *rec,
                         char *family, size_t family_cap,
                         char *country, size_t country_cap)
{
    cJSON *root = cJSON_Parse(json);
    if (root == NULL) { return false; }
    const cJSON *results = cJSON_GetObjectItemCaseSensitive(root, "results");
    const cJSON *r = cJSON_IsArray(results) ? cJSON_GetArrayItem(results, 0) : NULL;
    if (r == NULL) { cJSON_Delete(root); return false; }

    const cJSON *rocket = cJSON_GetObjectItemCaseSensitive(r, "rocket");
    const cJSON *cfg    = rocket ? cJSON_GetObjectItemCaseSensitive(rocket, "configuration") : NULL;
    const cJSON *miss   = cJSON_GetObjectItemCaseSensitive(r, "mission");
    const cJSON *orbit  = miss ? cJSON_GetObjectItemCaseSensitive(miss, "orbit") : NULL;
    const cJSON *lsp    = cJSON_GetObjectItemCaseSensitive(r, "launch_service_provider");
    const cJSON *pad    = cJSON_GetObjectItemCaseSensitive(r, "pad");
    const cJSON *loc    = pad ? cJSON_GetObjectItemCaseSensitive(pad, "location") : NULL;

    const char *dest = orbit ? jstr(orbit, "name") : NULL;
    upper_into(rec->destination, sizeof rec->destination,
               (dest != NULL) ? dest : "UNKNOWN");

    /* "MISSION  ·  ROCKET", the join poster.py builds before the fit ladder. */
    const char *mname = miss ? jstr(miss, "name") : NULL;
    if (mname == NULL) { mname = jstr(r, "name"); }
    const char *rname = cfg ? jstr(cfg, "full_name") : NULL;
    if (rname == NULL && cfg != NULL) { rname = jstr(cfg, "name"); }
    char joined[256];
    if (mname != NULL && rname != NULL) {
        snprintf(joined, sizeof joined, "%s  \xC2\xB7  %s", mname, rname);
    } else {
        snprintf(joined, sizeof joined, "%s", (mname != NULL) ? mname
                                            : (rname != NULL) ? rname : "");
    }
    upper_into(rec->line2, sizeof rec->line2, joined);

    /* "PROVIDER · SITE" -- the launch site truncated at its first comma.
     * LL2 tails sites with a country ("Jiuquan Satellite Launch Center,
     * People's Republic of China" is 59 chars) that the flag already states. */
    const char *prov = lsp ? jstr(lsp, "name") : NULL;
    const char *site = loc ? jstr(loc, "name") : NULL;
    char site_short[96];
    site_short[0] = '\0';
    if (site != NULL) {
        size_t n = 0;
        while (site[n] != '\0' && site[n] != ',' && n + 1u < sizeof site_short) { ++n; }
        memcpy(site_short, site, n);
        site_short[n] = '\0';
        while (n > 0u && site_short[n - 1u] == ' ') { site_short[--n] = '\0'; }
    }
    char who[192];
    if (prov != NULL && site_short[0] != '\0') {
        snprintf(who, sizeof who, "%s \xC2\xB7 %s", prov, site_short);
    } else {
        snprintf(who, sizeof who, "%s", (prov != NULL) ? prov
                                      : (site_short[0] != '\0') ? site_short : "");
    }
    upper_into(rec->who, sizeof rec->who, who);

    const char *net = jstr(r, "net");
    snprintf(rec->t0_utc, sizeof rec->t0_utc, "%s", (net != NULL) ? net : "");

    /* The AGENCY's country, not the pad's -- an Electron from Wallops is still
     * a New Zealand vehicle. Falls back to the pad when the provider has none,
     * exactly as launch.normalize() does. */
    const char *cc = lsp ? jstr(lsp, "country_code") : NULL;
    if (cc == NULL && loc != NULL) { cc = jstr(loc, "country_code"); }
    snprintf(country, country_cap, "%s", (cc != NULL) ? cc : "");

    const char *fam = cfg ? jstr(cfg, "family") : NULL;
    family_key(fam, family, family_cap);

    cJSON_Delete(root);
    return true;
}

/* ------------------------------------------------------------------ run */

static bool budget_allows(int n)
{
    const int64_t now = esp_timer_get_time();
    if (rtc_window_start_us == 0 || now - rtc_window_start_us > 3600LL * 1000000LL) {
        rtc_window_start_us = now;
        rtc_spent = 0;
    }
    return (rtc_spent + (uint32_t) n) <= LL2_HOURLY_CAP;
}

rocket_state_t rocket_app_run(void)
{
    ESP_LOGI(TAG, "build %s board %s", FIRMWARE_VERSION, ROCKET_BOARD_NAME);

    if (!display_manager_is_busy() && !sdcard_is_mounted()) {
        ESP_LOGW(TAG, "state=no-sd  panel untouched");
        return ROCKET_NO_SD;
    }

    /* ---- manifest ---- */
    char mpath[256];
    snprintf(mpath, sizeof mpath, "%s/manifest.json", CARD);
    size_t mlen = 0;
    uint8_t *mraw = read_file(mpath, &mlen);
    if (mraw == NULL) {
        ESP_LOGW(TAG, "state=no-sd  no manifest.json; panel untouched");
        return ROCKET_NO_SD;
    }
    cJSON *man = cJSON_Parse((const char *) mraw);
    free(mraw);
    if (man == NULL) {
        ESP_LOGW(TAG, "state=bad-card  manifest will not parse; panel untouched");
        return ROCKET_BAD_CARD;
    }
    const cJSON *fv = cJSON_GetObjectItemCaseSensitive(man, "format_version");
    if (!cJSON_IsNumber(fv) || fv->valueint != ROCKET_CARD_FORMAT) {
        /* Refuse a version we do not know rather than misreading one. */
        ESP_LOGW(TAG, "state=bad-card  card format v%d, firmware wants v%d",
                 cJSON_IsNumber(fv) ? fv->valueint : -1, ROCKET_CARD_FORMAT);
        cJSON_Delete(man);
        return ROCKET_BAD_CARD;
    }

    /* ---- budget ---- */
    if (!budget_allows(1)) {
        ESP_LOGI(TAG, "state=budget-spent  %u/%d this hour; panel untouched",
                 (unsigned) rtc_spent, LL2_HOURLY_CAP);
        cJSON_Delete(man);
        return ROCKET_BUDGET_SPENT;
    }

    /* ---- fetch ---- */
    char *json = heap_caps_malloc(24 * 1024, MALLOC_CAP_SPIRAM);
    if (json == NULL) { cJSON_Delete(man); return ROCKET_NO_NETWORK; }
    rtc_spent++;                       /* count the ATTEMPT: a 500 or a timeout
                                        * costs the upstream a slot too */
    const int status = fetch(LL2_UPCOMING, json, 24 * 1024);
    if (status == 429) {
        ESP_LOGW(TAG, "state=budget-spent  upstream said 429; backing off");
        rtc_spent = LL2_HOURLY_CAP;    /* authoritative, whatever we counted */
        free(json); cJSON_Delete(man);
        return ROCKET_BUDGET_SPENT;
    }
    if (status != 200) {
        rtc_missed_windows++;
        ESP_LOGW(TAG, "state=no-network  http %d, %u missed windows; panel untouched",
                 status, (unsigned) rtc_missed_windows);
        free(json); cJSON_Delete(man);
        return ROCKET_NO_NETWORK;
    }

    rocket_record_t rec = { {0}, {0}, {0}, {0} };
    char family[64], country[8];
    if (!parse_launch(json, &rec, family, sizeof family, country, sizeof country)) {
        ESP_LOGW(TAG, "state=no-network  response did not parse; panel untouched");
        free(json); cJSON_Delete(man);
        return ROCKET_NO_NETWORK;
    }
    free(json);
    rtc_missed_windows = 0;
    snprintf(rec.prev_line, sizeof rec.prev_line, "%s", rtc_prev_line);

    ESP_LOGI(TAG, "record dest=%s t0=%s family=%s cc=%s",
             rec.destination, rec.t0_utc, family, country);

    /* ---- layers ---- */
    char key[96];
    plate_key(man, rec.destination, country, key, sizeof key);

    const cJSON *plates = cJSON_GetObjectItemCaseSensitive(man, "plates");
    const cJSON *pj = cJSON_GetObjectItemCaseSensitive(plates, key);
    rkt_layer_t plate, body, bmask, kmask, flagl;
    uint8_t *o1 = NULL, *o2 = NULL, *o3 = NULL, *o4 = NULL, *o5 = NULL;
    const bool have_plate = cJSON_IsString(pj) && load_layer(pj->valuestring, &plate, &o1);

    const cJSON *veh = cJSON_GetObjectItemCaseSensitive(man, "vehicles");
    const cJSON *vj = cJSON_GetObjectItemCaseSensitive(veh, family);
    bool have_veh = false;
    if (vj != NULL) {
        have_veh = load_layer(jstr(vj, "body"), &body, &o2)
                && load_layer(jstr(vj, "body_mask"), &bmask, &o3)
                && load_layer(jstr(vj, "key_mask"), &kmask, &o4);
    }
    if (!have_veh) {
        /* No art for this family: the poster still renders, without a vehicle.
         * Coverage never has a hole, only a lower floor. */
        ESP_LOGI(TAG, "no vehicle art for '%s'; rendering without one", family);
    }

    const cJSON *flags = cJSON_GetObjectItemCaseSensitive(man, "flags");
    char ccu[8];
    upper_into(ccu, sizeof ccu, country);
    const cJSON *fj = cJSON_GetObjectItemCaseSensitive(flags, ccu);
    const bool have_flag = cJSON_IsString(fj) && load_layer(fj->valuestring, &flagl, &o5);

    /* ---- atlases ---- */
    static rocket_fonts_t fonts;
    static uint8_t *atlas_raw[24];
    fonts.count = 0;
    const cJSON *atl = cJSON_GetObjectItemCaseSensitive(man, "atlases");
    const cJSON *ae = NULL;
    cJSON_ArrayForEach(ae, atl) {
        if (fonts.count >= 24 || !cJSON_IsString(ae)) { continue; }
        char ap[256];
        snprintf(ap, sizeof ap, "%s/%s", CARD, ae->valuestring);
        size_t alen = 0;
        uint8_t *araw = read_file(ap, &alen);
        if (araw == NULL) { continue; }
        rkt_header_t ah;
        if (!rkt_parse_header(araw, alen, &ah) ||
            !rkt_atlas_open(araw + RKT_HEADER_BYTES, alen - RKT_HEADER_BYTES,
                            &fonts.atlas[fonts.count])) {
            free(araw);
            continue;
        }
        atlas_raw[fonts.count++] = araw;
    }
    ESP_LOGI(TAG, "card: plate=%d vehicle=%d flag=%d atlases=%d",
             have_plate, have_veh, have_flag, fonts.count);

    /* ---- render ---- */
    uint8_t *rgb = heap_caps_malloc((size_t) ROCKET_W * ROCKET_H * 3u,
                                    MALLOC_CAP_SPIRAM);
    rocket_state_t out = ROCKET_FRESH;
    if (rgb == NULL) {
        ESP_LOGE(TAG, "no PSRAM for the frame; panel untouched");
        out = ROCKET_BAD_CARD;
    } else {
        rocket_scene_t sc = {
            .plate = have_plate ? &plate : NULL,
            .body  = have_veh ? &body : NULL,
            .body_mask = have_veh ? &bmask : NULL,
            .key_mask  = have_veh ? &kmask : NULL,
            .dark = have_veh && (body.hdr.flags & 1u) != 0u,
            .field_ink = 1u,
        };
        const uint16_t rows = rocket_render_poster(&sc, &rec, &fonts,
                                                   have_flag ? &flagl : NULL, rgb);
        if (rows != ROCKET_H) {
            /* A short frame would paint a white band and report success --
             * begin_rgb_stream clears to WHITE and push_rgb_row reports OK for
             * an out-of-range row. Refuse instead. */
            ESP_LOGE(TAG, "short frame: %u of %u rows; refusing to show it",
                     rows, ROCKET_H);
            out = ROCKET_BAD_CARD;
        } else if (display_manager_show_rgb_buffer(rgb, ROCKET_W, ROCKET_H) != ESP_OK) {
            ESP_LOGE(TAG, "panel push failed; last image retained");
            out = ROCKET_BAD_CARD;
        } else {
            ESP_LOGI(TAG, "state=fresh  decision=redrew");
        }
        free(rgb);
    }

    /* Remember what we just showed, so the next wake can draw the LAST line.
     * The precision is explicit: line2 can be 255 bytes and this buffer is
     * 128, and an unbounded %s here is a -Wformat-truncation error under the
     * fork's -Werror. Truncating the tail of a "LAST ..." line is the right
     * loss -- the rocket name leads it. */
    snprintf(rtc_prev_line, sizeof rtc_prev_line, "LAST \xC2\xB7 %.118s", rec.line2);

    for (int i = 0; i < fonts.count; ++i) { free(atlas_raw[i]); }
    free(o1); free(o2); free(o3); free(o4); free(o5);
    cJSON_Delete(man);
    return out;
}
