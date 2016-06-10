/* jslint node: true */
'use strict';
var cfg = require('../../../config.json');

//return piece sides by weighted random
exports.pieceSide = function() {
	var rand = Math.floor(Math.random() * 10);
	var side = [3, 3, 3, 3, 3, 3, 4, 4, 4, 5];
	return side[rand];
};

exports.randomInRange = function (from, to) {
	return Math.floor(Math.random() * (to - from)) + from;
};

// generate a random position within the field of play
exports.randomPosition = function (radius) {
	return {
		x: exports.randomInRange(radius, cfg.gameWidth - radius),
		y: exports.randomInRange(radius, cfg.gameHeight - radius)
	};
};

exports.uniformPosition = function(points, radius) {
	var bestCandidate, maxDistance = 0;
	var numberOfCandidates = 10;
	if (points.length === 0) {
		return exports.randomPosition(radius);
	}
	// Generate the cadidates
	for (var ci = 0; ci < numberOfCandidates; ci++) {
		var minDistance = Infinity;
		var candidate = exports.randomPosition(radius);
		candidate.radius = radius;
		
		for (var pi = 0; pi < points.length; pi++) {
			var distance = exports.getDistance(candidate, points[pi]);
			if (distance < minDistance) {
				minDistance = distance;
			}
		}
		
		if (minDistance > maxDistance) {
			bestCandidate = candidate;
			maxDistance = minDistance;
		} else {
			return exports.randomPosition(radius);
		}
	}
	return bestCandidate;
};

exports.findIndex = function(arr, id) {
	var len = arr.length;
	while (len--) {
		if (arr[len].id === id) {
			return len;
		}
	}
	return -1;
};

//unused functions
exports.getDistance = function (p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) - p1.radius - p2.radius;
};