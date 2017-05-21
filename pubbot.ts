import { IPubbotStore } from "./pubbot_store";
import { IInstallationManager } from "./installations";
import * as uuid from "uuid";
import * as request from "request";

export type SendPubRequestCallback = (err: any) => void;

export abstract class Pubbot {
  protected spamIntervals: { [tc: string]: NodeJS.Timer } = {};

  constructor(protected pubStore: IPubbotStore, protected installs: IInstallationManager) {
    pubStore.on("timeout", (t: string, c: string) => this.timeout(t, c));
    pubStore.on("stop", (t: string, c: string) => this.stopSpam(t, c));
  }

  sendRequest(teamId: string, channelId: string, quorum: number, callback: SendPubRequestCallback) {
    // Store it in the store, then fire off the message!
    this.pubStore.newRequest(teamId, channelId, quorum, err => {
      if(err) return callback(err);

      // Ok, send the request to the channel!
      this.sendPubRequest(teamId, channelId, (err) => {
        if(err) return callback(err);
        callback(null);
      });
    });
  }

  tickRequest(teamId: string, channelId: string, callback: SendPubRequestCallback) {
    this.pubStore.tickRequest(teamId, channelId, (err, done) => {
      if(err) return callback(err);

      if(done) {
        // Woop, fire it!
        var k = `${teamId}:${channelId}`;
        this.spamIntervals[k] = setInterval(() => this.sendSpam(teamId, channelId), 1000);
      }

      callback(null);
    });
  }

  protected timeout(teamId: string, channelId: string) {
    // Aw :(
    // Just incase...
    var k = `${teamId}:${channelId}`;

    if(this.spamIntervals[k]) {
      clearInterval(this.spamIntervals[k]);
      delete this.spamIntervals[k];
    }

    this.sendTimeout(teamId, channelId);
  }

  protected stopSpam(teamId: string, channelId: string) {
    var k = `${teamId}:${channelId}`;

    if(this.spamIntervals[k]) {
      clearInterval(this.spamIntervals[k]);
      delete this.spamIntervals[k];
    }
  }

  protected abstract sendSpam(teamId: string, channelId: string): void;
  protected abstract sendPubRequest(teamId: string, channelId: string, callback: SendPubRequestCallback): void;
  protected abstract sendTimeout(teamId: string, channelId: string): void;
}

export class SlackPubbot extends Pubbot {
  protected webhookCache: { [k: string]: string } = {};

  constructor(pubStore: IPubbotStore, installs: IInstallationManager) {
    super(pubStore, installs);    
  }

  protected getWebhookUrl(teamId: string, channelId: string, callback: (err: any, webhook?: string) => void) {
    var k = `${teamId}:${channelId}`;

    if(this.webhookCache[k]) {
      return callback(null, this.webhookCache[k]);
    }
    else {
      this.installs.getInstallation(teamId, channelId, (err, inst) => {
        if(err) return callback(err);
        if(!inst) return callback("No installation found");

        this.webhookCache[k] = inst.webhookUrl;
        callback(null, inst.webhookUrl);
      });
    }
  }

  protected nukeCache(teamId: string, channelId: string) {
    var k = `${teamId}:${channelId}`;
    delete this.webhookCache[k];
  }

  protected sendPubRequest(teamId: string, channelId: string, callback: SendPubRequestCallback) {
    // Get the token to ask the question
    this.getWebhookUrl(teamId, channelId, (err, hook) => {
      if(err) return callback(err);
      if(!hook) return callback("No installation found");

      var payload = {
        text: "PUB O CLOCK?!",
        attachments: [{
          fallback: "This functionality is not available. Consider upgrading Slack!",
          callback_id: uuid.v4(),
          actions: [{
            name: "gotopub",
            text: "Let's Go!",
            type: "button",
            style: "primary",
          }]
        }]
      };

      request.post(hook, { body: payload, json: true }, (err, response, body) => {
        if(err) {
          this.nukeCache(teamId, channelId);
          return callback(err);
        }
      });
    });
  }

  protected sendSpam(teamId: string, channelId: string) {
    this.getWebhookUrl(teamId, channelId, (err, hook) => {
      if(err || !hook) return;

      var payload = {
        text: "PUB!",
      };

      request.post(hook, { body: payload, json: true }, (err, response, body) => {
        if(err) {
          this.nukeCache(teamId, channelId);
        }
      });
    });
  }

  protected sendTimeout(teamId: string, channelId: string) {
    this.getWebhookUrl(teamId, channelId, (err, hook) => {
      if(err || !hook) return;

      var payload = {
        text: "We didn't get enough for the pub :(",
      };

      request.post(hook, { body: payload, json: true }, (err, response, body) => {
        if(err) {
          this.nukeCache(teamId, channelId);
        }
      });
    });
  }
}