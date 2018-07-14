// keepie
// Copyright (C) 2018 by Nic Ferrier

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require("child_process");
const { Transform } = require("stream");

const express = require("express");
const bodyParser = require("body-parser");
const FormData = require('form-data');

const plainPasswordGenerator = require("./plain.js");

const app = express();


const typeMapper = {
    "plain": plainPasswordGenerator.genPassword
};

const configStruct = {
    "myservice": {
        "type": "plain",
        "urls": [
            "http://localhost:5000/pg/keepie-secret/"
        ]
    }
};

const config = {
    get: function (service) {
        return configStruct[service];
    },

    set: function(service, password) {
        configStruct[service] = password;
    }
};


exports.boot = function (port, options) {
    let opts = options != undefined ? options : {};
    let listenAddress = options.listenAddress;
    let rootDir = opts.rootDir != undefined ? opts.rootDir : __dirname + "/www";
    let config = opts.config != undefined ? opts.config : config;
    let requests = {
        list: [],

        add: function (service, receiptUrl) {
            requests.list.push({service: service, receiptUrl: receiptUrl});
        },

        process: async function () {
            if (requests.list.length > 0) {
                let { service, receiptUrl } = requests.list.pop();
                let { urls: serviceUrls,
                      password: servicePassword,
                      type: serviceType } = config.get(service);

                // Some passwords will need to be regenerated
                if (servicePassword === undefined) {
                    let genPassword = typeMapper[type];
                    console.log("genPassword", genPassword);
                    let password = await genPassword();
                    config.set(service, password);
                    servicePassword = password;
                }

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
    
    let listener = app.listen(port, listenAddress, async function () {
        let listenerCallback = opts.listenerCallback;
        if (typeof(listenerCallback) === "function") {
            listenerCallback(listener.address());
        }

        console.log("keepie listening on ", listener.address().port);
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
    exports.fs = fs;
}

// server.js ends here
