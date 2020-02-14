/**
 * @fileoverview Utility for executing npm commands.
 * @author Ian VanSchooten
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const
    spawn = require("cross-spawn"),
    log = require("./logging");

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

/**
 * Install node modules synchronously and save to devDependencies in package.json
 * @param   {string|string[]} packages Node module or modules to install
 * @returns {void}
 */
function installSyncSaveDev(packages) {
    let packageList = Array.isArray(packages) ? packages : [packages];
    const npmProcess = spawn.sync("npm", ["i", "--save-dev"].concat(packageList),
        { stdio: "inherit" });
    const error = npmProcess.error;

    if (error && error.code === "ENOENT") {
        const pluralS = packageList.length > 1 ? "s" : "";

        log.error(`Could not execute npm. Please install the following package${pluralS} with a package manager of your choice: ${packageList.join(", ")}`);
    }
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = {
    installSyncSaveDev
};
