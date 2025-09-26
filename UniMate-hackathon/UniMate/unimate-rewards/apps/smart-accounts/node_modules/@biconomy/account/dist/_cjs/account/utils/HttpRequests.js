"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpMethod = void 0;
exports.sendRequest = sendRequest;
const getAAError_js_1 = require("../../bundler/utils/getAAError.js");
const Logger_js_1 = require("./Logger.js");
var HttpMethod;
(function (HttpMethod) {
    HttpMethod["Get"] = "get";
    HttpMethod["Post"] = "post";
    HttpMethod["Delete"] = "delete";
})(HttpMethod || (exports.HttpMethod = HttpMethod = {}));
async function sendRequest({ url, method, body }, service) {
    const stringifiedBody = JSON.stringify(body);
    Logger_js_1.Logger.log(`${service} RPC Request`, { url, body: stringifiedBody });
    const response = await fetch(url, {
        method,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
        },
        body: stringifiedBody
    });
    let jsonResponse;
    try {
        jsonResponse = await response.json();
        Logger_js_1.Logger.log(`${service} RPC Response`, jsonResponse);
    }
    catch (error) {
        if (!response.ok) {
            throw await (0, getAAError_js_1.getAAError)(response.statusText, response.status, service);
        }
    }
    if (response.ok) {
        return jsonResponse;
    }
    if (jsonResponse.error) {
        throw await (0, getAAError_js_1.getAAError)(`Error coming from ${service}: ${jsonResponse.error.message}`);
    }
    if (jsonResponse.message) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.message, response.status, service);
    }
    if (jsonResponse.msg) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.msg, response.status, service);
    }
    if (jsonResponse.data) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.data, response.status, service);
    }
    if (jsonResponse.detail) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.detail, response.status, service);
    }
    if (jsonResponse.message) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.message, response.status, service);
    }
    if (jsonResponse.nonFieldErrors) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.nonFieldErrors, response.status, service);
    }
    if (jsonResponse.delegate) {
        throw await (0, getAAError_js_1.getAAError)(jsonResponse.delegate, response.status, service);
    }
    throw await (0, getAAError_js_1.getAAError)(response.statusText, response.status, service);
}
//# sourceMappingURL=HttpRequests.js.map