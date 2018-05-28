// keepie
// Copyright (C) 2018 by Nic Ferrier

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");

const express = require("express");
const bodyParser = require("body-parser");
const FormData = require('form-data');
 
const app = express();

const config = {
    "myservice": {
        "type": "plain",
        "password": "secret",
        "urls": [
            "http://localhost:5000/pg/keepie-secret/"
        ]
    }
};

exports.boot = function (port, options) {
    let opts = options != undefined ? options : {};
    let rootDir = opts.rootDir != undefined ? opts.rootDir : __dirname + "/www";

    let requests = {
        list: [],

        add: function (service, receiptUrl) {
            requests.list.push({service: service, receiptUrl: receiptUrl});
        },

        process: function () {
            if (requests.list.length > 0) {
                let { service, receiptUrl } = requests.list.pop();
                let { urls: serviceUrls,
                      password: servicePassword,
                      type: serviceType } = config[service];
                let [matchingUrl] = serviceUrls.filter(url => url == receiptUrl);
                if (matchingUrl === undefined) {
                    console.log("unauthorized request", service, receiptUrl);
                }
                else {
                    let form = new FormData();
                    form.append("password", servicePassword);
                    form.append("name", service);
                    console.log("sending password for", service, "to", receiptUrl);
                    form.submit(matchingUrl, (err, res) => {
                        console.log("sent password for", service, "to", receiptUrl);
                    });
                }
            }
        }
    };

    setInterval(requests.process, 2000);

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));
    //app.use("/keepie", express.static(rootDir));

    app.post("/keepie/:service([A-Za-z0-9_-]+)/request", function (req, response) {
        let { service } = req.params;
        let receiptUrl = req.get("x-receipt-url");
        if (service !== undefined && receiptUrl !== undefined) {
            console.log("received request to send", service, "to", receiptUrl);
            requests.add(service, receiptUrl);
            response.sendStatus(204);
            return;
        }
        response.sendStatus(400);
    });

    // Standard app callback stuff
    let appCallback = opts.appCallback;
    if (typeof(appCallback) === "function") {
        appCallback(app);
    }
    
    let listener = app.listen(port, "localhost", async function () {
        let listenerCallback = opts.listenerCallback;
        if (typeof(listenerCallback) === "function") {
            listenerCallback(listener.address());
        }

        console.log("listening on ", listener.address().port);
    });
};

if (require.main === module) {
    try {
        let port = parseInt(process.args.slice(2)[0])
        exports.boot(port);
    }
    catch (e) {
        console.log("couldn't start... port?", e);
    }
}
else {
    // Required as a module; that's ok, exports will be fine.
    exports.pgBoot = require(path.join(__dirname, "pgBoot.js"));
}

// server.js ends here
