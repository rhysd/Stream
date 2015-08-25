import * as app from "app";
import BrowserWindow = require("browser-window");
import * as path from "path";
import * as fs from "fs";
import * as ipc from "ipc";
import {openExternal} from "shell";
import SourceLoader from "./source-loader";
import Source from "./source";

require("crash-reporter").start();

// Show versions {{{
const versions: any = process.versions;
console.log("Stream version 0.0.0");
console.log("  Electron version " + versions.electron);
console.log("  Chrome version " + versions.chrome);
console.log("  io.js version " + versions.node);
// }}}

var mainWindow: GitHubElectron.BrowserWindow = null;
var react_extension_loaded = false;
var sources: Source[] = [];
global.load_paths = [
    path.join(app.getAppPath(), "plugin"),
    path.join(app.getPath("userData"), "plugin", "node_modules")
];

app.on("window-all-closed", function(){ app.quit(); });

app.on("ready", function(){
    mainWindow = new BrowserWindow(
        {
            width: 800,
            height: 800,
        }
    );

    const loader = new SourceLoader(global.load_paths, mainWindow);

    const html = "file://" + path.resolve(__dirname, "..", "..", "index.html");
    mainWindow.loadUrl(html);

    mainWindow.on("closed", function(){
        mainWindow = null;
    });

    mainWindow.on("will-navigate", function(e: Event, url: string){
        e.preventDefault();
        openExternal(url);
    });

    mainWindow.on("devtools-opened", function(){
        if (!react_extension_loaded) {
            const extension_path = path.join(__dirname, "..", "..", "devtools_extension", "react-devtools");
            if (fs.existsSync(extension_path)) {
                BrowserWindow.addDevToolsExtension(extension_path);
            }
            react_extension_loaded = true;
        }
    });

    // TODO: User should select streams to load
    // TODO: Load required sources after all sinks are loaded
    sources.push(loader.load("twitter"));

    mainWindow.openDevTools();

    ipc.on("renderer-ready", (event: Event, required_sources: string[]) => {
        console.log("main.ts: Initialize sources: " + required_sources);
        for (const src of sources) {
            if (required_sources.indexOf(src.source_name) !== -1) {
                src.initialize();
            }
        }
    });
});

