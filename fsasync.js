// fsasync stuff

const fs = require("fs");

fs.readdirAsync = function (folder) {
    return new Promise(function (resolve, reject) {
        try {
            fs.readdir(folder, function (err, files) {
                if (err) reject(err);
                else resolve(files);
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

fs.readFileAsync = function (filename, encoding) {
    return new Promise(function (resolve, reject) {
        try {
            let enc = (encoding === undefined) ? "utf8" : encoding;
            fs.readFile(filename, enc, function (err, buffer) {
                if (err) reject(err);
                else resolve(buffer);
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

fs.writeFileAsync = function (filename, data, encoding) {
    return new Promise(function (resolve, reject) {
        try {
            let enc = encoding === undefined ? "utf8" : encoding;
            fs.writeFile(filename, data, enc, function (err) {
                if (err) reject(err);
                else resolve();
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

fs.statAsync = function (path) {
    return new Promise(function (resolve, reject) {
        try {
            fs.stat(path, function (statObj, err) {
                if (err) reject(err);
                else resolve(statObj);
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

fs.existsAsync = function (path) {
    return new Promise((resolve, reject) => {
        try {
            fs.access(path, fs.constants.R_OK | fs.constants.W_OK, err => {
                if (err) resolve(false);
                else resolve(true);
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

fs.mkdirAsync = function (path) {
    return new Promise((resolve, reject) => {
        try {
            fs.mkdir(path, err => {
                if (err) reject(err);
                else resolve(true);
            });
        }
        catch (err) {
            reject(err);
        }
    });
};

module.exports = fs;

// fsasync.js ends here
