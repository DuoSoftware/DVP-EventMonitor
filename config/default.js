module.exports = {
    "Freeswitch": {
        ip: '159.203.160.47',
        port: 8021,
        password: 'ClueCon',
        httport: 8080
    },

    "DB": {
        "Type":"postgres",
        "User":"duo",
        "Password":"DuoS123",
        "Port":5432,
        "Host":"104.236.231.11",
        "Database":"duo"
    },

    Dialer: {
        ip: '192.168.0.5',
        port: 2223
    },

    ARDS: {
        ip: 'ardsliteservice.app.veery.cloud',
        port: 2225,
        version: '1.0.0.0'
    },

    NS: {
        ip: 'notificationservice.app.veery.cloud',
        port: 8765,
        version: '1.0.0.0'
    },

    Services : {
        interactionServiceHost: "192.168.0.132",
        interactionServicePort: "3637",
        interactionServiceVersion: "1.0.0.0",
        dccaclientHost: "127.0.0.1",
        dccaclientPort: 4555,
        dccaclientVersion: "1.0.0.0"
    },

    WebAPI: {

        domain: '192.168.1.58',
        port: 80,
        path: '/CSReqWebApi/api/'
    },

    Redis: {
        ip: '45.55.142.207',
        port: 6389,
        password: "DuoS123",
        db: 4
    },

    RabbitMQ: {
        "ip":"45.55.142.207",
        "port":"5672",
        "user": "SYS_RABBITMQ_USER",
        "password": "SYS_RABBITMQ_PASSWORD"
    },

    Token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiMTdmZTE4M2QtM2QyNC00NjQwLTg1NTgtNWFkNGQ5YzVlMzE1Iiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE4OTMzMDI3NTMsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NjEyOTkxNTN9.YiocvxO_cVDzH5r67-ulcDdBkjjJJDir2AeSe3jGYeA",
    billingEnabled: true,
    evtConsumeType: 'amqp'
};