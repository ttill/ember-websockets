import Ember from 'ember';
import ENUMS from '../utils/enums';

var typeOf  = Ember.typeOf;
var isEmpty = Ember.isEmpty;

export default Ember.Mixin.create({

	socketURL        : null,
	socketContexts   : {}, // This is shared between route instances.
	keepSocketAlive  : null,
	socketConnection : null,
	socketBinaryType : null,

	setupController: function(controller) {
		var urlHashKey;
		var socketURL        = this.get('socketURL');
		var websocket        = this.get('socketConnection');
		var socketContexts   = this.get('socketContexts');
		var socketBinaryType = this.get('socketBinaryType');

		if(!this.validateSocketURL(socketURL)) {
			this._super.apply(this, arguments);
			return false;
		}

		/*
			Initialize the socket if it is null or has been closed.
			If the ready state is closed this is because the route closed the socket on a previous
			deactivate and now we are back into this same route so we need to reopen (create) it.
		*/
		if(!websocket || websocket.readyState === window.WebSocket.CLOSED) {
			websocket = new window.WebSocket(socketURL);
			websocket.binaryType = socketBinaryType || 'blob';
			urlHashKey = websocket.url;

			// This will only fire if the urlHashKey has added an extra / to the end of the url. This will only
			// happen if your socketURL is at the rootLevel such as ws://example.com or ws://localhost:8080 in which the
			// the urlHashKey will be ws://example.com/ and ws://localhost:8080/ respectfully.
			this.set('socketURL', urlHashKey);

			// If we dont have the hashKey in our shared object this means we are creating the first socket for a given
			// url
			if(!socketContexts[urlHashKey]) {
				socketContexts[urlHashKey] = [];
			}

			this.removeRouteFromContexts(socketContexts, socketURL, this);
			socketContexts[urlHashKey].pushObject({controller: controller, route: this});
			this.set('socketConnection', this.initializeSocket(websocket, socketContexts));
		}

		/*
			Make sure that we call the super function just in case the object
			who is using this mixin will have their activate function called.
		*/
		this._super.apply(this, arguments);
	},

	/*
		Overrides the onopen, onmessage, etc methods that get envoked on the socket.
		This methods will instead send an action and pass along the data coming back.
	*/
	initializeSocket: function(websocket, socketContexts) {
		Ember.EnumerableUtils.forEach(ENUMS.SOCKET_EVENTS, function(eventName) {
			websocket[eventName] = function(data) {
				socketContexts[data.currentTarget.url].forEach(function(context) {

					// Only fire the action on the socket we care about.
					if(context.route.socketConnection === data.target) {
						context.controller.send(eventName, data);
					}
				});
			};
		});

		return websocket;
	},

	/*
		Validates that the socketURL is set and contains a valid ws or wss protocal url.
		socketURL can either be a string or an array of strings.
	*/
	validateSocketURL: function(socketURL) {
		var wsProtocolRegex = /^(ws|wss):\/\//i;
		var urlsAreValid    = true;

		if(typeOf(socketURL) !== 'array') {
			socketURL = [socketURL];
		}

		if(isEmpty(socketURL)) {
			return false;
		}

		Ember.EnumerableUtils.forEach(socketURL, function(url) {
			if(isEmpty(url) || !url.match(wsProtocolRegex)) {
				urlsAreValid = false;
			}
		});

		return urlsAreValid;
	},

	removeRouteFromContexts: function(socketContexts, socketURL, route) {
		if(socketContexts[socketURL] && socketContexts[socketURL].length > 0) {
			socketContexts[socketURL] = socketContexts[socketURL].rejectBy('route', route);
			return true;
		}

		return false;
	},

	/*
		When the route deactivates or "transitions away" we will either close the
		connection or keep it "alive"
	*/
	deactivate: function() {
		var keepSocketAlive  = this.get('keepSocketAlive');
		var socketConnection = this.get('socketConnection');

		// By default within deactivate we will close the connection. If keepSocketAlive
		// is set to true then we will skip this and the socket will not be closed.
		if(!keepSocketAlive) {
			if(socketConnection && typeOf(socketConnection.close) === 'function') {
				socketConnection.close();
			}
		}

		this._super.apply(this, arguments);
	},

	actions: {
		/*
			This is an action that controllers, components, view, etc can send
			which will make its way to the
		*/
		emit: function(data, shouldStringify) {
			var socketConnection = this.get('socketConnection');

			if(shouldStringify && JSON && JSON.stringify) {
				data = JSON.stringify(data);
			}

			// Only send the data if we have an active connection
			if(socketConnection && typeOf(socketConnection.send) === 'function' && socketConnection.readyState === window.WebSocket.OPEN) {
				socketConnection.send(data);
			}
		},

		/*
			This action closes the websocket connection.
		*/
		closeSocket: function() {
			var socketConnection = this.get('socketConnection');

			if(socketConnection && typeOf(socketConnection.close) === 'function') {
				socketConnection.close();
			}
		},

		/*
			These are just catch alls so we do not get the error message: 'nothing
			handled this action...'. These should be overridden by the controller.
		*/
		onmessage : Ember.K,
		onerror   : Ember.K,
		onopen    : Ember.K,
		onclose   : Ember.K
	}
});
