/**
 * @fileoverview Config file operations. This file must be usable in the browser,
 * so no Node-specific code can be here.
 * @author Nicholas C. Zakas
 */
"use strict";

const RULE_SEVERITY_STRINGS = ["off", "warn", "error"];

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = {

    /**
     * Converts old-style severity settings (0, 1, 2) into new-style
     * severity settings (off, warn, error) for all rules. Assumption is that severity
     * values have already been validated as correct.
     * @param {Object} config The config object to normalize.
     * @returns {void}
     */
    normalizeToStrings(config) {
        if (config.rules) {
            Object.keys(config.rules).forEach(ruleId => {
                const ruleConfig = config.rules[ruleId];
                if (typeof ruleConfig === "number") {
                    config.rules[ruleId] = RULE_SEVERITY_STRINGS[ruleConfig] || RULE_SEVERITY_STRINGS[0];
                } else if (Array.isArray(ruleConfig) && typeof ruleConfig[0] === "number") {
                    ruleConfig[0] = RULE_SEVERITY_STRINGS[ruleConfig[0]] || RULE_SEVERITY_STRINGS[0];
                }
            });
        }
    },
};
