const path = require("path");
const multer  = require('multer');
const upload = multer();

const assetsDir = path.join(__dirname, "psqlweb-assets");

exports.init = function (app) {
    app.get(new RegExp("/psql(\/)*$"), function (req, resp) {
        resp.sendFile(path.join(assetsDir, "index.html"));
    });

    app.get(new RegExp("/psql((\/style.css)|(\/index.js))"), function (req, resp) {
        resp.sendFile(path.join(assetsDir, req.params[0]));
    });

    app.post("/psql", upload.array(), async function (req, resp) {
        let data = req.body;
        let { command } = data;
        let result = await app.query(command);
        resp.json(result);
    });
}

// End
