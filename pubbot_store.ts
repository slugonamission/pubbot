import * as events from "events";
import * as uuid from "uuid";

export type NewRequestCallback = (err: any) => void;
export type TickRequestCallback = (err: any, done?: boolean) => void;
export type StopSpamCallback = (err: any) => void;

// This should also have two events.
// An "expired" event for when a pub request has timed out, called with (teamId: string, channelId: string)
// A "stop" event for when a pub spam needs to shut up, called with (teamId: string, channelId: string).
export interface IPubbotStore extends events.EventEmitter {
  newRequest(teamId: string, channelId: string, quorum: number, callback: NewRequestCallback): void;
  tickRequest(teamId: string, channelId: string, callback: TickRequestCallback): void;
  stopSpam(teamId: string, channelId: string, callback: StopSpamCallback): void;
}

interface InMemoryPubbots {
  requiredAcks: number;
  timeoutTick: NodeJS.Timer;
  stfuTimeout?: NodeJS.Timer;
};

const DEFAULT_PUB_TIMEOUT = 300000;
const DEFAULT_STFU_TIMEOUT = 60000;

export class InMemoryPubbotStore extends events.EventEmitter implements IPubbotStore {
  protected pubTracking: { [token: string]: InMemoryPubbots } = {};

  constructor() {
    super();
  }

  newRequest(teamId: string, channelId: string, quorum: number, callback: NewRequestCallback) {
    // Is there already a request for this team/channel?
    var found = false;
    var k = `${teamId}:${channelId}`;

    if(this.pubTracking[k] !== undefined) {
      return callback("A pub request is already active!");
    }

    // Store it and set it going!
    var newPub: InMemoryPubbots = {
      requiredAcks: quorum,
      timeoutTick: setTimeout(() => this.timeout(k), DEFAULT_PUB_TIMEOUT)
    }

    this.pubTracking[k] = newPub;

    callback(null);
  }

  tickRequest(teamId: string, channelId: string, callback: TickRequestCallback) {
    var k = `${teamId}:${channelId}`;

    if(this.pubTracking[k] === undefined) return callback("Invalid token");
    
    // Stop the timeout
    clearTimeout(this.pubTracking[k].timeoutTick);

    var remainingTicks = --this.pubTracking[k].requiredAcks;

    if(remainingTicks) {
      this.pubTracking[k].stfuTimeout = setTimeout(() => this.stfu(k), DEFAULT_STFU_TIMEOUT);
      callback(null, true);
    }
    else {
      this.pubTracking[k].timeoutTick = setTimeout(() => this.timeout(k), DEFAULT_PUB_TIMEOUT);
      callback(null, false);
    }
  }

  stopSpam(teamId: string, channelId: string, callback: StopSpamCallback) {
    var k = `${teamId}:${channelId}`;

    if(this.pubTracking[k] === undefined) return callback("Invalid team/channel ID");

    delete this.pubTracking[k];

    this.emit("stop", teamId, channelId);
  }

  protected stfu(token: string) {
    var teamId = token.split(":")[0];
    var channelId = token.split(":")[1];

    delete this.pubTracking[token];

    this.emit("stop", teamId, channelId);
  }

  protected timeout(token: string) {
    // Aw :(
    // Delete and fire the event
    var teamId = token.split(":")[0];
    var channelId = token.split(":")[1];

    delete this.pubTracking[token];

    this.emit("timeout", teamId, channelId);
  }
}