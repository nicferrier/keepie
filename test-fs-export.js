const fs = require("./server.js").fs;
const assert = require("assert");


// quick test that we can export fs from keepie ok
async function test () {
    let file = await fs.promises.readFile("test-fs-export.js");
    let value = file.split("\n").slice(0, 2);
    assert.deepEqual(value, [
        'const fs = require("./server.js").fs;',
        'const assert = require("assert");'
    ], `failed because ${value}`);
}

test();

// end test
