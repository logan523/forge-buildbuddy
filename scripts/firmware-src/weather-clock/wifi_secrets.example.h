// wifi_secrets.example.h — template for the gitignored wifi_secrets.h.
// Copy this file to wifi_secrets.h (same folder) and fill in real networks.
// The sketch #includes "wifi_secrets.h"; the build fails loudly if it's
// missing, which is the point — credentials never live in tracked source.
#pragma once
struct WifiNetwork { const char* ssid; const char* password; };
const WifiNetwork WIFI_NETWORKS[] = {
  { "YOUR_WIFI_NAME", "YOUR_WIFI_PASSWORD" },
};
const int WIFI_NETWORK_COUNT = sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);
