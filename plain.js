const crypto = require("crypto");

function cryptit() {
    return new Promise((resolve, reject) => {
        crypto.pseudoRandomBytes(128, function(err, raw) {
            if (err) reject(err);
            else resolve(raw.toString("base64"));
        });
    });
}

exports.genPassword = async function () {
    return await cryptit();
};

// Ends here
