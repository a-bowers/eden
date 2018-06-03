#!/usr/bin/env node

var app = require('./compiler.js').compile;
var fs = require('fs');
var path = require('path');
var dotenv = require('dotenv');
dotenv.load();

// This allows wt-serve to work with this despite not having
// compiler support locally, this shall forever be called 
// wt-makeshift-compiler
let requestHandler = null;

module.exports = function (ctx, req, res) {
    // Compilation done, now bootstrap the app.
    function takeRequest() {
        requestHandler(ctx, req, res);
    }

    // Compilation finished handler
    function compileDone(err, fn) {
        if (err) {
            return res.end(err.toString());
        }
        // Bootstrap the application actually
        requestHandler = fn;
        takeRequest(ctx, req, res);
    }

    // This tries to polyfill the options object expected
    // expected by a wt-compiler on the cloud instance
    var options = {
        // Allow mocking a third party extension.
        script: fs.readFileSync(path.join(__dirname, "./script.py")).toString('utf8'),
        meta: {
            name: "edentest",
            main: "app",
            test: true,
            moduleName: "scripts.script:app"
        },
        secrets: process.env
    };


    // If we already have the requestHandler "compiled" execute it.
    if (requestHandler !== null) {
        return takeRequest();
    }
    
    app(options, compileDone);
};