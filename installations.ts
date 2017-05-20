import * as mongodb from "mongodb";
import * as request from "request";

const SLACK_API = "https://api.slack.com/api";

const EXCHANGE_URI = `${SLACK_API}/oauth.access`;
const TEAM_INFO_URI = `${SLACK_API}/team.info`;

export interface Installation {
  teamId: string;
  channelId: string;
  accessToken: string;
}

export interface IInstallationManager {
  provideCode(code: string, callback: ProvideCodeCallback): void;
  getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback): void;
}

export type ProvideCodeCallback = (err?: any) => void;
export type GetInstallationCallback = (err?: any, inst?: Installation) => void;

interface TokenChannelTuple {
  token: string;
  channel: string;
}

export class InstallationManager implements IInstallationManager {
  protected installations: mongodb.Collection;

  constructor(db: mongodb.Db, protected clientId: string, protected clientSecret: string) {
    this.installations = db.collection("installations");
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
          channelId: info.channel
        };

        this.installations.insertOne(installation, (err) => {
          if(err) return callback(err);
          callback();
        });
      });
    });
  }

  protected getInfoForCode(code: string, callback: (err: any, info?: TokenChannelTuple) => void) {
    var opts = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code
    };

    this.issueRequest("oauth.access", "", "POST", opts, (err, body) => {
      if(err) return callback(err);
      if(!body || !body.access_token) return callback("No access token in response body");

      callback(null, { token: body.access_token, channel: body.incoming_webhook.channel_id });
    });
  }

  protected getTeamIdForToken(token: string, callback: (err: any, teamId?: string) => void) {
    this.issueRequest("team.info", token, "GET", {}, (err, body) => {
      if(err) return callback(err);
      if(!body) return callback("No body provided to team.info");
      if(!body.ok) return callback("Error in team.info: " + body.error);
      
      callback(null, body.team.id);
    });
  }

  getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback) {
     // This one is easier :)
    var filter: any = {
      teamId: teamId
    };

    if(channelId) filter['channelId'] = channelId;

    this.installations.findOne({teamId: teamId}, (err, rec) => {
      if(err) return callback(err);

      return callback(null, rec);
    });
  }

  protected issueRequest(endpoint: string, token: string, method: string, params: any, callback: (err: any, body: any) => void) {
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