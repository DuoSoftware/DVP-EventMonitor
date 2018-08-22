/**
 * Created by dinusha on 6/12/2017.
 */

var mongomodels = require('dvp-mongomodels');
var User = require('dvp-mongomodels/model/User');
var UserAccount = require('dvp-mongomodels/model/UserAccount');



var getUserData = function(id, callback)
{
    User.findOne({_id: id}).exec(function (err, user)
    {
        callback(err, user);
    });
};

var getUserAccountData = function(companyId, tenantId, refId, callback)
{
    UserAccount.findOne({company: companyId, tenant: tenantId, userref: refId}).exec(function (err, user)
    {
        callback(err, user);
    });
};

var getSuperUsers = function(callback)
{
    User.find({'user_meta.role': "superadmin"}).exec(function (err, userList)
    {
        callback(err, userList);
    });
};

module.exports.getUserData = getUserData;
module.exports.getSuperUsers = getSuperUsers;
module.exports.getUserAccountData = getUserAccountData;
