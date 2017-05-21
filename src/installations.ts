import * as redis from "redis";
import * as request from "request";

const SLACK_API = "https://api.slack.com/api";

const EXCHANGE_URI = `${SLACK_API}/oauth.access`;
const TEAM_INFO_URI = `${SLACK_API}/team.info`;

// We should refactor this to pull webhookUrl out of the structure.
// Possibly just provide an "any" field for the other parameters?
export interface Installation {
  teamId: string;
  channelId: string;
  accessToken: string;
  webhookUrl: string;
}

export interface IInstallationManager {
  provideCode(code: string, callback: ProvideCodeCallback): void;
  getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback): void;
}

export type ProvideCodeCallback = (err?: any) => void;
export type GetInstallationCallback = (err?: any, inst?: Installation) => void;

interface TokenInfo {
  token: string;
  channel: string;
  webhook: string;
}

export abstract class InstallationManager implements IInstallationManager {
  constructor(protected clientId: string, protected clientSecret: string) {
  }

  // This provides a temporary code, and exchanges it for
  // an actual access token, and retrieves the teamID too.
  provideCode(code: string, callback: ProvideCodeCallback) {
    // Exchange first
    var opts = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code
    };

    this.getInfoForCode(code, (err, info) => {
      if(err) return callback(err);
      if(!info) return callback("No token..."); // Mostly to keep TSC happy :)

      this.getTeamIdForToken(info.token, (err, team) => {
        if(err) return callback(err);
        if(!team) return callback("No team...");

        var installation: Installation = {
          accessToken: info.token,
          teamId: team,
          channelId: info.channel,
          webhookUrl: info.webhook
        };

        this.saveInstallation(installation, err => {
          if(err) return callback(err);
          callback();
        });
      });
    });
  }

  protected abstract saveInstallation(inst: Installation, callback: (err: any) => void): void;
  abstract getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback): void;

  protected getInfoForCode(code: string, callback: (err: any, info?: TokenInfo) => void) {
    var opts = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code
    };

    this.issueRequestInner("oauth.access", "", "POST", opts, (err, body) => {
      if(err) return callback(err);
      if(!body || !body.access_token) return callback("No access token in response body");

      callback(null, { token: body.access_token, channel: body.incoming_webhook.channel_id, webhook: body.incoming_webhook.url });
    });
  }

  protected getTeamIdForToken(token: string, callback: (err: any, teamId?: string) => void) {
    this.issueRequestInner("team.info", token, "GET", {}, (err, body) => {
      if(err) return callback(err);
      if(!body) return callback("No body provided to team.info");
      if(!body.ok) return callback("Error in team.info: " + body.error);
      
      callback(null, body.team.id);
    });
  }

  protected issueRequestInner(endpoint: string, token: string, method: string, params: any, callback: (err: any, body: any) => void) {
    if(!params) params = {};

    if(token && token !== "") params['token'] = token;

    var opts: request.CoreOptions = {
      method: method
    };

    if(method == "GET") {
      opts.qs = params;
    }
    else {
      opts.form = params;
    }

    request(`${SLACK_API}/${endpoint}`, opts, (err, response, body) => {
      if(body) body = JSON.parse(body);
      callback(err, body);
    });
  }
}

const REDIS_OAUTH_KEY_PREFIX = "oauth";

export class RedisInstallationManager extends InstallationManager {
  constructor(protected db: redis.RedisClient, clientId: string, clientSecret: string) {
    super(clientId, clientSecret);
  }

  protected saveInstallation(inst: Installation, cb: (err?:any) => void) {
    var key = `${REDIS_OAUTH_KEY_PREFIX}:${inst.teamId}:${inst.channelId}`;

    var payload = JSON.stringify(inst);

    this.db.set(key, payload, (err, reply) => {
      if(err) return cb(err);
      cb();
    });
  }

  getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback) {
    var key = `${REDIS_OAUTH_KEY_PREFIX}:${teamId}:${channelId}`;

    this.db.get(key, (err, reply) => {
      if(err) return callback(err);

      var inst: Installation = JSON.parse(reply);
      callback(null, inst);
    });
  }
}