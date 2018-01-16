var auth        = require("../helpers/auth");
var _           = require('lodash');
var defaultLog  = require('winston').loggers.get('default');
var mongoose    = require('mongoose');
var Actions     = require('../helpers/actions');

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
}

exports.publicGet = function (args, res, next) {
  // Build match query if on CommentId route
  var query = {};
  if (args.swagger.params.CommentId && args.swagger.params.CommentId.value) {
    query = { "_id": mongoose.Types.ObjectId(args.swagger.params.CommentId.value)};
  }
  if (args.swagger.params.commentperiod && args.swagger.params.commentperiod.value) {
    var oids = [];
    _.each(args.swagger.params.commentperiod.value, function (i) {
      oids.push(mongoose.Types.ObjectId(i));
    });
    query = _.assignIn({ "_commentPeriod": {
        $in: oids
      }
    });
  }
  defaultLog.info("query:", query);

  getComments(['public'], query, args.swagger.params.fields.value)
  .then(function (data) {
    return Actions.sendResponse(res, 200, data);
  });
};
exports.protectedGet = function(args, res, next) {
  var Comment = mongoose.model('Comment');

  defaultLog.info("args.swagger.params:", args.swagger.params.auth_payload.scopes);

  // Build match query if on CommentId route
  var query = {};
  if (args.swagger.params.CommentId && args.swagger.params.CommentId.value) {
    query = { "_id": mongoose.Types.ObjectId(args.swagger.params.CommentId.value)};
  }
  if (args.swagger.params.commentperiod && args.swagger.params.commentperiod.value) {
    var oids = [];
    _.each(args.swagger.params.commentperiod.value, function (i) {
      oids.push(mongoose.Types.ObjectId(i));
    });
    query = _.assignIn({ "_commentPeriod": {
        $in: oids
      }
    });
  }
  defaultLog.info("query:", query);

  getComments(args.swagger.params.auth_payload.scopes, query, args.swagger.params.fields.value)
  .then(function (data) {
    return Actions.sendResponse(res, 200, data);
  });
};

//  Create a new Comment
exports.unProtectedPost = function (args, res, next) {
  var obj = args.swagger.params.comment.value;
  defaultLog.info("Incoming new object:", obj);

  var Comment = mongoose.model('Comment');
  var comment = new Comment(obj);
  // Define security tag defaults
  comment.tags = [['sysadmin']];
  comment.review.tags = [['sysadmin']];
  comment.commentAuthor.tags = [['sysadmin']];

  // Unless they request to be anon, make their stuff public.
  // TODO: Contact name/location/org currently showing public
  // when they request anonymous.
  if (!comment.commentAuthor.requestedAnonymous) {
    comment.commentAuthor.tags = [['sysadmin'], ['public']];
  }

  // Never allow this to be updated
  comment.commentAuthor.internal.tags = [['sysadmin']];

  // Not needed until we tie user profiles in.
  // comment._addedBy = args.swagger.params.auth_payload.userID;

  comment.save()
  .then(function (c) {
    // defaultLog.info("Saved new Comment object:", c);
    return Actions.sendResponse(res, 200, c);
  });
};

// Update an existing Comment
exports.protectedPut = function (args, res, next) {
  var objId = args.swagger.params.CommentId.value;
  defaultLog.info("ObjectID:", args.swagger.params.CommentId.value);

  var obj = args.swagger.params.CommentId.value;
  // Strip security tags - these will not be updated on this route.
  delete obj.tags;
  delete obj.review.tags;
  delete obj.commentAuthor.tags;

  // Never allow this to be updated
  delete obj.commentAuthor.internal.tags;

  defaultLog.info("Incoming updated object:", obj);
  // TODO sanitize/update audits.

  var Comment = require('mongoose').model('Comment');
  Comment.findOneAndUpdate({_id: objId}, obj, {upsert:false, new: true}, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);
      return Actions.sendResponse(res, 200, o);
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
}

// Publish/Unpublish the Comment
exports.protectedPublish = function (args, res, next) {
  var objId = args.swagger.params.CommentId.value;
  defaultLog.info("Publish Comment:", objId);

  var Comment = require('mongoose').model('Comment');
  Comment.findOne({_id: objId}, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);

      // Add public to the tag of this obj.
      Actions.publish(o)
      .then(function (published) {
        // Published successfully
        return Actions.sendResponse(res, 200, published);
      }, function (err) {
        // Error
        return Actions.sendResponse(res, err.code, err);
      });
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
};
exports.protectedUnPublish = function (args, res, next) {
  var objId = args.swagger.params.CommentId.value;
  defaultLog.info("UnPublish Comment:", objId);

  var Comment = require('mongoose').model('Comment');
  Comment.findOne({_id: objId}, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);

      // Remove public to the tag of this obj.
      Actions.unPublish(o)
      .then(function (unpublished) {
        // UnPublished successfully
        return Actions.sendResponse(res, 200, unpublished);
      }, function (err) {
        // Error
        return Actions.sendResponse(res, err.code, err);
      });
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
};
var getComments = function (role, query, fields) {
  return new Promise(function (resolve, reject) {
    var Comment = mongoose.model('Comment');
    var projection = {};

    // Fields we always return
    var defaultFields = ['_id',
                        'tags'];
    _.each(defaultFields, function (f) {
        projection[f] = 1;
    });

    // Add requested fields - sanitize first by including only those that we can/want to return
    var sanitizedFields = _.remove(fields, function (f) {
      return (_.indexOf(['name',
                        'commentNumber',
                        'comment',
                        'internal',
                        'dateAdded',
                        'commentAuthor',
                        'documents',
                        'review',
                        '_addedBy',
                        '_commentPeriod',
                        'review',
                        'commentStatus',
                        'isDeleted'], f) !== -1);
    });
    _.each(sanitizedFields, function (f) {
      projection[f] = 1;
    });

    Comment.aggregate([
      {
        "$match": query
      },
      {
        "$project": projection
      },
      {
        $redact: {
         $cond: {
            if: {
              $anyElementTrue: {
                    $map: {
                      input: "$tags" ,
                      as: "fieldTag",
                      in: { $setIsSubset: [ "$$fieldTag", role ] }
                    }
                  }
                },
              then: "$$DESCEND",
              else: "$$PRUNE"
            }
          }
        }
    ]).exec()
    .then(function (data) {
      defaultLog.info("data:", data);
      resolve(data);
    });
  });
};