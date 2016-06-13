var mysql = require('mysql');

function getConn(){
	var db = mysql.createConnection({
		host: 'localhost',
		user: 'root',
		password: 'CNL_final',
		database: 'cnl_final',
		port: 3306 
	});
	db.connect(function(err) {
		if(err) {
			console.log(err);
		}
	});
	return db;
}

function getDeletebyKey(key) {
	var db = getConn();
	db.query("DELETE FROM `user_status` WHERE db_key='" + key + "';", function(err, results) {
		if (err) {
			console.log(err);  
		}
	});
	db.end();
}

function getDeletebyTime() {
	var expire = (new Date().getTime() / 1000).toFixed(0) - 86400;
	var db = getConn();
	db.query("DELETE FROM `user_status` WHERE insert_time<'" + expire + "';", function(err, results) {
		if (err) {
			console.log(err);  
		}
	});
	db.end();
}

function getQuery(key, player, socket) {
	var db = getConn();
	db.query("SELECT * FROM `user_status` WHERE db_key='" + key + "';", function(err, results) {
		if (err) {
			console.log(err);
		} else {
			var obj = JSON.parse(JSON.stringify(results));
			player.name = obj[0].name;
			player.x = parseInt(obj[0].x);
			player.y = parseInt(obj[0].y);
			player.speed = parseInt(obj[0].speed);
			player.power = parseInt(obj[0].power);
			player.bombNum = parseInt(obj[0].bombNum);
			player.item[0] = (parseInt(obj[0].item) % 2 !== 0);
			player.item[1] = (parseInt(obj[0].item) >= 2);
			player.score = parseInt(obj[0].score);
			player.level = parseInt(obj[0].level);
			player.skillpoint = parseInt(obj[0].skillpoint);
			player.avatar = parseInt(obj[0].avatar);
			player.protection = parseInt(obj[0].protection);
			player.slowdown = parseInt(obj[0].slowdown);
			player.opposite = parseInt(obj[0].opposite);
			socket.emit('welcome', player, false);
		}
	});
	db.end();
	getDeletebyKey(key);
	getDeletebyTime();
}

function getInsert(key, player) {
	var db = getConn();
	var data = {
		db_key: key,
		insert_time: (new Date().getTime() / 1000).toFixed(0),
		name: player.name,
		x: Math.floor(player.x),
		y: Math.floor(player.y),
		speed: player.speed,
		power: player.power,
		bombNum: player.bombNum,
		item: (player.item[0] ? 1 : 0) + (player.item[1] ? 2 : 0),
		score: player.score,
		level: player.level,
		skillpoint: player.skillpoint,
		avatar: player.avatar,
		protection: player.protection,
		slowdown: player.slowdown,
		opposite: player.opposite
	};
	db.query("INSERT INTO `user_status` SET ?", data, function(err) {
		if (err) {
			console.log(err);  
		}
	});
	db.end();
}

exports.getQuery = getQuery;
exports.getInsert = getInsert;