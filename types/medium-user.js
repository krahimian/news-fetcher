/* global require, module */

var social = require('../modules/social');
var async = require('async');
var URI = require('urijs');
var cheerio = require('cheerio');

var request = require('../modules/request');

module.exports = {
  re: /^(https?:\/\/)?(www\.)?medium.com\/@[^/\s]+\/?$/i,

  init: function(opts) {
    return {

      type: 'medium user',

      getLogo: function(html) {
	var $;
	try {
	  $ = cheerio.load(html);
	} catch(e) {
	  opts.log.error(e);
	}
	if (!$) return null;

	var image = $('meta[property="og:image"]').attr('content');
	return image || null;
      },

      build: function(source, cb) {
	var self = this;

	opts.log.debug('building source')

	request({
	  uri: this.url
	}, function (error, response, body) {

	  if (error) {
	    cb(error);
	    return;
	  }

	  source.data = {};
	  source.feed_url = response.request.uri.href;

	  try {
	    var str = /window\[\"obvInit\"\]\(([\s\S]+)\/\/ \]\]/ig.exec(body)[1];
	    str = str.replace(/\)([^\)]*)$/,'$1');
	    var globals = JSON.parse(str);
	    source.data = globals;
	    source.title = source.data.user.name;
	  } catch(e) {
	    opts.log.error(e);
	  }

	  source.logo_url = self.getLogo(body);

	  cb();
	});
      },

      getStats: function(id, cb) {
	opts.log.debug('getting post stats')
	request({
	  uri: 'https://medium.com/p/' + id + '/upvotes',
	  headers: {
	    'accept': 'application/json'
	  }
	}, function(error, response, body) {
	  if (error) {
	    cb(error);
	    return;
	  }

	  var count = 1;

	  try {
	    var data = body.substring(16);
	    count = JSON.parse(data).payload.value.count;
	  } catch(e) {
	    opts.log.error(e);
	  }

	  cb(null, count);
	});
      },

      buildPost: function(entry, cb) {
	var self = this;
	var url = new URI(this.url).segment(1, entry.uniqueSlug).toString();

	opts.log.debug('building post:', url)

	async.parallel({
	  social: function(next) {
	    social.all(url, next);
	  },
	  medium: function(next) {
	    self.getStats(entry.id, next);
	  }
	}, function(err, results) {
	  cb(err, {
	    title: entry.title,
	    content_url: "",
	    score: results.medium || 1,
	    social_score: results.social.total,
	    url: url
	  });
	});
      },

      getPosts: function(source, cb) {
	var self = this;
	source.posts = [];

	if (!source.data) {
	  cb('missing data');
	  return;
	}

	async.mapSeries(source.data.latestPosts, this.buildPost.bind(this), function(err, results) {
	  source.posts = results;
	  cb(err);
	});
      }
    };
  }
};
