/* Print rkt_fmt_when() for each ISO stamp on argv, so Python can diff it
 * against poster.fmt_when(). The conformance fixtures never straddle a DST
 * boundary, so without this the Eastern-time arithmetic -- the one place with
 * real calendar maths -- would ship untested on the C side. */
#include <stdio.h>
#include "../renderer/rocket_text.h"

int main(int argc, char **argv)
{
    char out[64];
    for (int i = 1; i < argc; i += 2) {
        rkt_fmt_when(argv[i], (i + 1 < argc) ? argv[i + 1] : "", out, sizeof out);
        printf("%s\n", out);
    }
    return 0;
}
