"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAAError = exports.DOCS_URL = exports.ERRORS_URL = void 0;
exports.ERRORS_URL = "https://raw.githubusercontent.com/bcnmy/aa-errors/main/docs/errors.json";
exports.DOCS_URL = "https://docs.biconomy.io/troubleshooting/commonerrors";
const UNKOWN_ERROR_CODE = "520";
const knownErrors = [];
const matchError = (message) => knownErrors.find((knownError) => message.toLowerCase().indexOf(knownError.regex.toLowerCase()) > -1) ?? null;
const buildErrorStrings = (error, status, service) => [
    `${status}: ${error.description}\n`,
    error.causes?.length
        ? ["Potential cause(s): \n", ...error.causes, ""].join("\n")
        : "",
    error.solutions?.length
        ? ["Potential solution(s): \n", ...error.solutions].join("\n")
        : "",
    service ? `\nSent via: ${service}` : ""
].filter(Boolean);
const getAAError = async (message, httpStatus, service) => {
    if (!knownErrors.length) {
        const errors = (await (await fetch(exports.ERRORS_URL)).json());
        knownErrors.push(...errors);
    }
    const details = `${service} - ${typeof message}` === "string"
        ? message
        : JSON.stringify(message);
    const matchedError = matchError(details);
    const status = matchedError?.regex ?? (httpStatus ?? UNKOWN_ERROR_CODE).toString();
    const metaMessages = matchedError
        ? buildErrorStrings(matchedError, status, service)
        : [];
    const title = matchedError ? matchedError.name : "Unknown Error";
    const docsSlug = matchedError?.docsUrl ?? exports.DOCS_URL;
    return new Error([title, status, docsSlug, metaMessages, details].join("\n"));
};
exports.getAAError = getAAError;
//# sourceMappingURL=getAAError.js.map