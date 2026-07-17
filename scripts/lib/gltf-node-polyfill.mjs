// three.js GLTFExporter targets the browser: it converts its internal Blob to an
// ArrayBuffer via FileReader, which Node doesn't have as a global. Node 18+ does
// have Blob (with .size + .arrayBuffer()), so a ~10-line FileReader is all we need.
// The exporter assigns `reader.onloadend` AFTER calling readAsArrayBuffer, so the
// callback MUST fire on a later microtask — blob.arrayBuffer().then(...) does that.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((ab) => {
          this.result = ab;
          if (typeof this.onloadend === "function") this.onloadend();
        })
        .catch((err) => {
          if (typeof this.onerror === "function") this.onerror(err);
        });
    }
  };
}
