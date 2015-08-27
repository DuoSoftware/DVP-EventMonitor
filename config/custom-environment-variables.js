/**
 * Created by dinusha on 4/22/2015.
 */
module.exports = {
    Freeswitch: {
        ip: 'FS_IP',
        port: 'FS_PORT',
        password: 'FS_PASSWORD',
        httport: 'FS_HTTP_PORT'
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
        ip: 'DIALER_IP',
        port: 'DIALER_PORT'
    },

    WebAPI: {

        domain: 'WEBAPI_DOMAIN',
        port: 'WEBAPI_PORT',
        path: 'WEBAPI_PATH'
    },

    Redis: {
        ip: 'SYS_REDIS_HOST',
        port: 'SYS_REDIS_PORT'
    }
};