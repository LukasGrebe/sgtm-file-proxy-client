const returnResponse = require('returnResponse');
const getRequestPath = require('getRequestPath');
const getRequestMethod = require('getRequestMethod');
const getRequestHeader = require('getRequestHeader');
const getRequestBody = require('getRequestBody');
const templateDataStorage = require('templateDataStorage');
const setResponseStatus = require('setResponseStatus');
const setResponseHeader = require('setResponseHeader');
const setResponseBody = require('setResponseBody');
const sendHttpRequest = require('sendHttpRequest');
const makeTableMap = require('makeTableMap');
const sha256Sync = require('sha256Sync');
const makeInteger = require('makeInteger');
const createRegex = require('createRegex');

const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;

const path = getRequestPath();
const method = getRequestMethod().toUpperCase();
const cacheKey = sha256Sync(data.url);

if (path === data.path) {
    require('claimRequest')();
    runClient();
}

function runClient()
{
    if (data.useCache && (method === 'GET' || method === 'OPTIONS')) {
        const cachedFile = templateDataStorage.getItemCopy('proxy_' + cacheKey);

        if (!cachedFile) {
            getFileAndReturnResponse();
        } else {
            const cachedHeaders = templateDataStorage.getItemCopy('proxy_headers_' + cacheKey) || {};

            sendResponse(200, cachedHeaders, cachedFile);
        }
    } else {
        getFileAndReturnResponse();
    }
}

function getFileAndReturnResponse()
{
    let requestSettings = {
        method: method,
    };

    if (data.requestHeaders) {
        requestSettings.headers = makeTableMap(data.requestHeaders, 'name', 'value');
    }

    if (method === 'POST') {
        //ensure post requests use the request's content-type
        if (!requestSettings.headers) {
            requestSettings.headers = {};
        }
        requestSettings.headers['Content-Type'] = getRequestHeader('Content-Type');
    }

    if (data.requestTimeout) {
        requestSettings.timeout = data.requestTimeout;
    }

    sendHttpRequest(data.url, requestSettings, getRequestBody()).then((result) => {
        const statusCode = result.statusCode;
        const originHeaders = result.headers;
        const file = result.body;
        const excludedHeaders = [
            'transfer-encoding'
        ];

        const filteredOriginHeaders = {};
        for (const key in originHeaders) {
            if (excludedHeaders.indexOf(key.toLowerCase()) === -1) {
                filteredOriginHeaders[key] = originHeaders[key];
            }else{
                if (isDebug) {
                    logToConsole('filtered Header', key, originHeaders[key]);
                }
            }
        }

        if (data.responseStatusCode) {
            if (data.useCache && method !== 'POST') {
                templateDataStorage.setItemCopy('proxy_' + cacheKey, file);
                templateDataStorage.setItemCopy('proxy_headers_' + cacheKey, filteredOriginHeaders);
            }

            sendResponse(makeInteger(data.responseStatusCode), filteredOriginHeaders, file);
        } else {
            if (statusCode >= 200 && statusCode < 300) {
                if (data.useCache && method !== 'POST') {
                    templateDataStorage.setItemCopy('proxy_' + cacheKey, file);
                    templateDataStorage.setItemCopy('proxy_headers_' + cacheKey, filteredOriginHeaders);
                }
                sendResponse(statusCode, filteredOriginHeaders, file);
            } else {
                if (isDebug) {
                    logToConsole('Failed to download a file: ', path);
                }

                sendResponse(statusCode, filteredOriginHeaders, file);
            }
        }
    }, requestSettings);
}


function sendResponse(statusCode, originHeaders, file)
{
    if (data.useOriginHeaders && originHeaders) {
        for (let headerKey in originHeaders) {
            setResponseHeader(headerKey, originHeaders[headerKey]);
        }
    }

    const requestOrigin = getRequestHeader('Origin');

    const originRegex = createRegex(data.allowOrigin, 'i');
    if (requestOrigin && requestOrigin.match(originRegex)) {
        setResponseHeader('access-control-allow-origin', requestOrigin);
    }

    if (data.responseHeaders) {
        let responseHeaders = makeTableMap(data.responseHeaders, 'name', 'value');

        for (let headerKey in responseHeaders) {
            setResponseHeader(headerKey, responseHeaders[headerKey]);
        }
    }

    if (data.contentType) {
        setResponseHeader('content-type', data.contentType);
    }

    if(method === 'OPTIONS') {
        setResponseHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        setResponseHeader('access-control-allow-headers', 'Content-Type, x-gtm-server-preview');
        setResponseStatus(200);
        returnResponse();
    }

    setResponseStatus(statusCode);
    if(file && method !== 'OPTIONS' && method !== 'HEAD') setResponseBody(file); //could be 204 no content
    returnResponse();
}
