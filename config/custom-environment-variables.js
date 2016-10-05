/**
 * Created by dinusha on 4/22/2015.
 */
module.exports = {
    Freeswitch: {
        ip: 'SYS_FREESWITCH_HOST',
        port: 'SYS_EVENTSOCKET_PORT',
        password: 'SYS_FREESWITCH_EVENTSOCKET_PASSWORD',
        httport: 'SYS_XMLRPC_PORT'
    },

    "DB": {
        "Type":"SYS_DATABASE_TYPE",
        "User":"SYS_DATABASE_POSTGRES_USER",
        "Password":"SYS_DATABASE_POSTGRES_PASSWORD",
        "Port":"SYS_SQL_PORT",
        "Host":"SYS_DATABASE_HOST",
        "Database":"SYS_DATABASE_POSTGRES_USER"
    },

    Dialer: {
        ip: 'SYS_DIALER_HOST',
        port: 'SYS_DIALER_PORT'
    },

    ARDS: {
        ip: 'SYS_ARDSLITESERVICE_HOST',
        port: 'SYS_ARDSLITESERVICE_PORT',
        version: 'SYS_ARDSLITESERVICE_VERSION'
    },

    NS: {
        ip: 'SYS_NOTIFICATIONSERVICE_HOST',
        port: 'SYS_NOTIFICATIONSERVICE_PORT',
        version: 'SYS_NOTIFICATIONSERVICE_VERSION'
    },


    WebAPI: {

        domain: 'WEBAPI_DOMAIN',
        port: 'WEBAPI_PORT',
        path: 'WEBAPI_PATH'
    },

    Redis: {
        ip: 'SYS_REDIS_HOST',
        port: 'SYS_REDIS_PORT',
        password: 'SYS_REDIS_PASSWORD',
        db: 'SYS_REDIS_DB_PROCESSCDR'
    },

    Token: "HOST_TOKEN"
};
