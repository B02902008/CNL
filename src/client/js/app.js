var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;
var reason;

var playerConfig = {
	border: 6,
	textColor: '#FFFFFF',
	textBorder: '#000000',
	textBorderSize: 2
};
var player = {
	id: -1,
	x: global.screenWidth / 2,
	y: global.screenHeight / 2,
	screenWidth: global.screenWidth,
	screenHeight: global.screenHeight,
	target: {x: 0, y: 0}
};
global.player = player;

if ( /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent) ) {
	global.mobile = true;
}

function startGame(type, key) {
	//set global variables
	global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0,25);
	playerNameInput.value = '';
	global.playerType = type;
	global.screenWidth = window.innerWidth;
	global.screenHeight = window.innerHeight;
	//show the game area
	document.getElementById('startMenuWrapper').style.maxHeight = '0px';
	document.getElementById('gameAreaWrapper').style.opacity = 1;
	//[in server]:socket.handshake.query.type
	if (!socket) {
		socket = io({query:"type=" + type});
		setupSocket(socket);
	}
	if (!global.animLoopHandle)
		animloop();
	socket.emit('respawn', key);
	window.canvas.socket = socket;
	global.socket = socket;
}

window.onload = function() {
	var startBtn = document.getElementById('startButton'),
		resumeBtn  = document.getElementById('resumeButton'),
		nickErrorText = document.querySelector('#startMenu .input-error');
	var expire = new Date(); 
	expire.setTime(expire.getTime() - 1);
	//start button clicked
	startBtn.onclick = function () {
		document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
		startGame('player', '');
	};
	//enter key clicked
	playerNameInput.addEventListener('keypress', function (e) {
		var key = e.which || e.keyCode;
		if (key === global.KEY_ENTER) {
			document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
			startGame('player', '');
		}
	});
	//resume button clicked
	resumeBtn.onclick = function () {
		var db_key = document.cookie.match(new RegExp("(^| )DB_KEY=([^;]*)(;|$)")); 
		if(db_key !== null) {
			document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
			startGame('player', db_key[2]);
		} else {
			startGame('player', '');
		}
	};
};

var items = [];
var pieces = [];
var darts = [];
var bombs = [];
var users = [];
var leaderboard = [];
var target = {x: 0, y: 0};
global.target = target;

window.canvas = new Canvas();

var c = window.canvas.cv;
var graph = c.getContext('2d');

$( "#bomb" ).click(function() {
	socket.emit('1');
	c.focus();
});
$( "#break" ).click(function() {
	var expire = new Date(), db_key = new Date().getTime() + '_' + global.player.id;
	expire.setTime(expire.getTime() + (1 * 86400000));
	document.cookie = "DB_KEY=" + db_key + ";expires=" + expire.toGMTString();
	socket.emit('3', db_key);
	c.focus();
});
$( "#avatar_fore" ).click(function() {
	socket.emit('4', "avatar", true);
	c.focus();
});
$( "#avatar_back" ).click(function() {
	socket.emit('4', "avatar", false);
	c.focus();
});
$( "#bomb_plus" ).click(function() {
	socket.emit('4', "bomb", false);
	c.focus();
});
$( "#speed_plus" ).click(function() {
	socket.emit('4', "speed", false);
	c.focus();
});
$( "#power_plus" ).click(function() {
	socket.emit('4', "power", false);
	c.focus();
});

function setupSocket(socket) {
	//Handle error.
	socket.on('connect_failed', function () {
		socket.close();
		global.disconnected = true;
	});
	socket.on('disconnect', function () {
		socket.close();
		global.disconnected = true;
	});
	//Handle connection.
	socket.on('welcome', function (playerSettings, nameChange) {
		player = playerSettings;
		if (nameChange) {
			player.name = global.playerName;
		} else {
			global.playerName = player.name;
		}
		player.screenWidth = global.screenWidth;
		player.screenHeight = global.screenHeight;
		player.target = window.canvas.target;
		global.player = player;
		socket.emit('gotit', player);
		global.gameStart = true;
		c.focus();
	});
	socket.on('gameSetup', function(data) {
		global.gameWidth = data.gameWidth;
		global.gameHeight = data.gameHeight;
		resize();
	});

	socket.on('leaderboard', function (data) {
		leaderboard = data;
		var leader = '<span class="title">Score Ranking</span>';
		for (var i = 0; i < leaderboard.length; i++) {
			leader += '<br />';
			if (leaderboard[i].id == player.id) {
				if(leaderboard[i].name.length !== 0)
					leader += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
				else
					leader += '<span class="me">' + (i + 1) + ". No Name</span>";
			} else {
				if(leaderboard[i].name.length !== 0)
					leader += (i + 1) + '. ' + leaderboard[i].name;
				else
					leader += (i + 1) + '. No Name';
			}
		}
		document.getElementById('ranking').innerHTML = leader;
	});
	//handle update
	socket.on('serverTellPlayerMove', function (userData, itemsList, piecesList, dartList, bombsList) {
		var playerData;
		//find self
		for (var i = 0; i < userData.length; i++) {
			if (typeof(userData[i].id) == "undefined") {
				playerData = userData[i];
				break;
			}
		}
		//renew self data
		player.x = playerData.x;
		player.y = playerData.y;
		document.getElementById('level_status').innerHTML = "Level : " + playerData.level;
		document.getElementById('score_status').innerHTML = "Score : " + playerData.score;
		document.getElementById('point_status').innerHTML = "Skill Points left : " + playerData.skillpoint;
		document.getElementById('bomb_status').innerHTML = "Bombs left : " + playerData.bombNum;
		document.getElementById('speed_status').style.width = playerData.speed + "%";
		document.getElementById('power_status').style.width = playerData.power + "%";
		document.getElementById('exp_status').style.width = Math.floor(100 * playerData.score / Math.pow(2, playerData.level)) + "%";
		document.getElementById('exp_status').innerHTML = playerData.score + "/" + Math.pow(2, playerData.level);
		document.getElementById('shield').src = playerData.item[0] ? "img/shield.png" : "img/shield_no.png";
		document.getElementById('dart').src = playerData.item[1] ? "img/dart.png" : "img/dart_no.png";
		//put to list
		users = userData;
		items = itemsList;
		pieces = piecesList;
		darts = dartList;
		bombs = bombsList;
	});
	// Death.
	socket.on('RIP', function (data) {
		global.gameStart = false;
		reason = data;
		global.died = true;
		window.setTimeout(function() {
			document.getElementById('gameAreaWrapper').style.opacity = 0;
			document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
			global.died = false;
			if (global.animLoopHandle) {
				window.cancelAnimationFrame(global.animLoopHandle);
				global.animLoopHandle = undefined;
			}
		}, 2500);
	});

	socket.on('kick', function (data) {
		global.gameStart = false;
		reason = data;
		global.kicked = true;
		socket.close();
	});
}

function drawCircle(centerX, centerY, radius, sides) {
	var theta = 0;
	var x = 0, y = 0;
	//begin drawing
	graph.beginPath();
	for (var i = 0; i < sides; i++) {
		theta = (i / sides) * 2 * Math.PI;
		x = centerX + radius * Math.sin(theta);
		y = centerY + radius * Math.cos(theta);
		graph.lineTo(x, y);
	}
	//finish drawing
	graph.closePath();
	graph.stroke();
	graph.fill();
}

function drawText(centerX, centerY, content) {
	var fontSize = 15;
	graph.font = 'bold ' + fontSize + 'px sans-serif';
	graph.lineWidth = playerConfig.textBorderSize;
	graph.fillStyle = playerConfig.textColor;
	graph.strokeStyle = playerConfig.textBorder;
	graph.textAlign = 'center';
	graph.textBaseline = 'middle';
	graph.strokeText(content, centerX, centerY);
	graph.fillText(content, centerX, centerY);
}

function drawItem(item) {
	var x = item.x - player.x + global.screenWidth / 2;
	var y = item.y - player.y + global.screenHeight / 2;
	var img = document.getElementById("item_" + item.type);
	graph.drawImage(img, x - 19, y - 19);
}

function drawPiece(piece) {
	var x = piece.x - player.x + global.screenWidth / 2;
	var y = piece.y - player.y + global.screenHeight / 2;
	var img;
	if (piece.targetDir.x === 0){
		if (piece.targetDir.y >= 0)
			img = document.getElementById("piece_" + piece.score + "_down");
		else
			img = document.getElementById("piece_" + piece.score + "_up");
	} else {
		if (piece.targetDir.x > 0)
			img = document.getElementById("piece_" + piece.score + "_right");
		else
			img = document.getElementById("piece_" + piece.score + "_left");
	}
	graph.drawImage(img, x - 30, y - 30);
}

function drawDart(dart) {
	var x = dart.x - player.x + global.screenWidth / 2;
	var y = dart.y - player.y + global.screenHeight / 2;
	graph.strokeStyle = "#000000";
	graph.fillStyle = "#000000";
	graph.lineWidth = 0;
	drawCircle(x, y, 2, 30);
}

function drawBomb(bomb) {
	var x = bomb.x - player.x + global.screenWidth / 2;
	var y = bomb.y - player.y + global.screenHeight / 2;
	var img;
	if (bomb.exploded) {
		img = document.getElementById("explosion");
		graph.drawImage(img, x - bomb.range, y - bomb.range, bomb.range * 2, bomb.range * 2);
	} else {
		img = document.getElementById("item_bomb");
		graph.drawImage(img, x - 50, y - 57);
		var timetext = "00：00";
		if (bomb.time > 0) {
			timetext = bomb.time.toFixed(2).replace(".", "：");
			if (timetext.length < 5)
				timetext = "0" + timetext;
		}
		drawText(x, y, timetext);
	}
}

function drawUser(user) {
	var x = user.x - player.x + global.screenWidth / 2;
	var y = user.y - player.y + global.screenHeight / 2;
	var img = document.getElementById("player_" + user.avatar);
	graph.drawImage(img, x - 35, y - 40);
	//draw username
	var nameCell = "";
	if(typeof(user.id) == "undefined")
		nameCell = player.name;
	else
		nameCell = user.name;
	drawText(x, y + user.radius + 10, nameCell);
}

function valueInRange(min, max, value) {
	return Math.min(max, Math.max(min, value));
}

function drawgrid() {
     graph.lineWidth = 1;
     graph.strokeStyle = global.lineColor;
     graph.globalAlpha = 0.15;
     graph.beginPath();

    for (var x = global.xoffset - player.x; x < global.screenWidth; x += global.screenHeight / 18) {
        graph.moveTo(x, 0);
        graph.lineTo(x, global.screenHeight);
    }

    for (var y = global.yoffset - player.y ; y < global.screenHeight; y += global.screenHeight / 18) {
        graph.moveTo(0, y);
        graph.lineTo(global.screenWidth, y);
    }

    graph.stroke();
    graph.globalAlpha = 1;
}

function drawborder() {
    graph.lineWidth = 1;
    graph.strokeStyle = playerConfig.borderColor;

    // Left-vertical.
    if (player.x <= global.screenWidth/2) {
        graph.beginPath();
        graph.moveTo(global.screenWidth/2 - player.x, 0 ? player.y > global.screenHeight/2 : global.screenHeight/2 - player.y);
        graph.lineTo(global.screenWidth/2 - player.x, global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Top-horizontal.
    if (player.y <= global.screenHeight/2) {
        graph.beginPath();
        graph.moveTo(0 ? player.x > global.screenWidth/2 : global.screenWidth/2 - player.x, global.screenHeight/2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth/2 - player.x, global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Right-vertical.
    if (global.gameWidth - player.x <= global.screenWidth/2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.screenHeight/2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Bottom-horizontal.
    if (global.gameHeight - player.y <= global.screenHeight/2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.lineTo(global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }
}

window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.msRequestAnimationFrame     ||
            function( callback ) {
                window.setTimeout(callback, 1000 / 60);
            };
})();

window.cancelAnimFrame = (function(handle) {
    return  window.cancelAnimationFrame     ||
            window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
	if (global.died) {
		//player died
		graph.fillStyle = '#333333';
		graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
		graph.textAlign = 'center';
		graph.fillStyle = '#FFFFFF';
		graph.font = 'bold 30px sans-serif';
		graph.fillText(reason, global.screenWidth / 2, global.screenHeight / 2);
	} else if (!global.disconnected) {
		//in game
		if (global.gameStart) {
			//draw background and grid and border
			graph.fillStyle = global.backgroundColor;
			graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
			drawgrid();
			drawborder();
			//draw objects
			graph.lineJoin = 'round';
			graph.lineCap = 'round';
			items.forEach(drawItem);
			pieces.forEach(drawPiece);
			darts.forEach(drawDart);
			bombs.forEach(drawBomb);
			users.forEach(drawUser);
			socket.emit('0', window.canvas.target); // playerSendTarget "Heartbeat".
		} else {
			graph.fillStyle = '#333333';
			graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
			graph.textAlign = 'center';
			graph.fillStyle = '#FFFFFF';
			graph.font = 'bold 30px sans-serif';
			graph.fillText('Game Loading‧‧‧', global.screenWidth / 2, global.screenHeight / 2);
		}
	} else {
		//disconnected
		graph.fillStyle = '#333333';
		graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
		graph.textAlign = 'center';
		graph.fillStyle = '#FFFFFF';
		graph.font = 'bold 30px sans-serif';
		if (global.kicked) {
			if (reason !== '') {
				graph.fillText('You were kicked for:', global.screenWidth / 2, global.screenHeight / 2 - 20);
				graph.fillText(reason, global.screenWidth / 2, global.screenHeight / 2 + 20);
			}
			else {
				graph.fillText('You were kicked!', global.screenWidth / 2, global.screenHeight / 2);
			}
		}
		else {
			graph.fillText('Disconnected!', global.screenWidth / 2, global.screenHeight / 2);
		}
	}
}

window.addEventListener('resize', resize);

function resize() {
	player.screenWidth = c.width = global.screenWidth = global.playerType == 'player' ? window.innerWidth : global.gameWidth;
	player.screenHeight = c.height = global.screenHeight = global.playerType == 'player' ? window.innerHeight : global.gameHeight;
	socket.emit('windowResized', { screenWidth: global.screenWidth, screenHeight: global.screenHeight });
}
