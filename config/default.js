module.exports = {
    Freeswitch: {
        ip: '45.55.205.92',
        port: 8021,
        password: 'ClueCon',
        httport: 8080
    },

    "DB": {
        "Type":"postgres",
        "User":"duo",
        "Password":"DuoS123",
        "Port":5432,
        "Host":"127.0.0.1",
        "Database":"dvpdb"
    },

    Dialer: {
        ip: '192.168.0.15',
        port: 2223
    },

    WebAPI: {

        domain: '192.168.1.58',
        port: 80,
        path: '/CSReqWebApi/api/'
    },

    Redis: {
        ip: '192.168.3.200',
        port: 6379
    }
};