var global = require('./global');

class Canvas {
	constructor(params) {
		this.target = global.target;
		this.reenviar = true;
		this.socket = global.socket;
		this.directions = [];
		this.dartTarget = {x:0, y:0};
		var self = this;
		this.cv = document.getElementById('cvs');
		this.cv.width = global.screenWidth;
		this.cv.height = global.screenHeight;
		//input event
		this.cv.addEventListener('mousemove', this.mouseTarget, false);
		this.cv.addEventListener('mouseup', this.mouseUp, false);
		this.cv.addEventListener('mousedown', this.mouseDown, false);
		this.cv.addEventListener('keypress', this.keyInput, false);
		this.cv.addEventListener('keyup', this.directionUp, false);
		this.cv.addEventListener('keydown', this.directionDown, false);
		this.cv.addEventListener('touchstart', this.touchInput, false);
		this.cv.addEventListener('touchmove', this.touchInput, false);
		this.cv.addEventListener('touchend', this.touchEnd, false);
		this.cv.parent = self;
		global.canvas = this;
	}

	directionDown(event) {
		var key = event.which || event.keyCode;
		var self = this.parent;
		if (self.directional(key)) {
			if (self.newDirection(key, self.directions, true)) {
				self.updateTarget(self.directions);
				self.socket.emit('0', self.target);
			}
		}
	}

	directionUp(event) {
		var key = event.which || event.keyCode;
		var self = this.parent;
		this.parent.reenviar = true;
		if (self.directional(key)) {
			if (self.newDirection(key, self.directions, false)) {
				self.updateTarget(self.directions);
				self.socket.emit('0', self.target);
			}
		}
	}
	
	mouseTarget(mouse) {
		this.parent.dartTarget.x = mouse.clientX - this.width / 2;
		this.parent.dartTarget.y = mouse.clientY - this.height / 2;
		global.dartTarget = this.parent.dartTarget;
	}
	
	mouseUp(mouse) {
		mouse = mouse || window.event;
		switch (mouse.which) {
			case 1:
				this.parent.reenviar = true;
				break;
			case 3:
				this.parent.reenviar = true;
				break;
		}
	}
	
	mouseDown(mouse) {
		mouse = mouse || window.event;
		switch (mouse.which) {
			case 1:
				if (this.parent.reenviar) {
					this.parent.socket.emit('1');
					this.parent.reenviar = false;
				}
				break;
			case 3:
				if (this.parent.reenviar) {
					this.parent.socket.emit('2', this.parent.dartTarget);
					this.parent.reenviar = false;
				}
				break;
		}
	}
	
	keyInput(event) {
		var key = event.which || event.keyCode;
		if (key == global.KEY_BREAK && this.parent.reenviar) {
			var expire = new Date(), db_key = new Date().getTime() + '_' + global.player.id;
			expire.setTime(expire.getTime() + (1 * 86400000));
			document.cookie = "DB_KEY=" + db_key + ";expires=" + expire.toGMTString();
			this.parent.socket.emit('3', db_key);
			this.parent.reenviar = false;
		} else if (key == global.KEY_BLIND && this.parent.reenviar) {
			global.blindMode = ~(global.blindMode);
			this.parent.reenviar = false;
		}
	}
	// Updates the direction array including information about the new direction.
	newDirection(direction, list, isAddition) {
		var result = false;
		var found = false;
		for (var i = 0, len = list.length; i < len; i++) {
			if (list[i] == direction) {
				found = true;
				if (!isAddition) {
					result = true;
					// Removes the direction.
					list.splice(i, 1);
				}
				break;
			}
		}
		// Adds the direction.
		if (isAddition && found === false) {
			result = true;
			list.push(direction);
		}
		return result;
	}

	// Updates the target according to the directions in the directions array.
	updateTarget(list) {
		this.target = { x : 0, y: 0 };
		var directionHorizontal = 0;
		var directionVertical = 0;
		for (var i = 0, len = list.length; i < len; i++) {
			if (directionHorizontal === 0) {
				if (list[i] == global.KEY_LEFT) directionHorizontal -= Number.MAX_VALUE;
				else if (list[i] == global.KEY_RIGHT) directionHorizontal += Number.MAX_VALUE;
			}
			if (directionVertical === 0) {
				if (list[i] == global.KEY_UP) directionVertical -= Number.MAX_VALUE;
				else if (list[i] == global.KEY_DOWN) directionVertical += Number.MAX_VALUE;
			}
		}
		this.target.x += directionHorizontal;
		this.target.y += directionVertical;
		global.target = this.target;
	}

	directional(key) {
		return this.horizontal(key) || this.vertical(key);
	}
	horizontal(key) {
		return key == global.KEY_LEFT || key == global.KEY_RIGHT;
	}
	vertical(key) {
		return key == global.KEY_DOWN || key == global.KEY_UP;
	}
	//for mobile
	touchInput(touch) {
		touch.preventDefault();
		touch.stopPropagation();
		this.parent.target.x = touch.touches[0].clientX - this.width / 2;
		this.parent.target.y = touch.touches[0].clientY - this.height / 2;
		global.target = this.parent.target;
	}
	touchEnd(touch) {
		this.parent.target.x = 0;
		this.parent.target.y = 0;
		global.target = this.parent.target;
	}
}

export default Canvas;
