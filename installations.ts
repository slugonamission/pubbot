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

export type ProvideCodeCallback = (err?: any) => void;
export type GetInstallationCallback = (err?: any, inst?: Installation) => void;

export class InstallationManager {
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

    this.issueRequest("oauth.access", "", "POST", opts, (err, body) => {
      if(err) return callback(err);
      if(!body || !body.access_token) return callback("No access token in response body");

      var tok = body.access_token;
      var channelId = body.incoming_webhook.channel_id;

      // Find the team ID for that token
      this.issueRequest("team.info", tok, "GET", {}, (err, body) => {
        if(err) return callback(err);
        if(!body) return callback("No body provided to team.info");
        if(!body.ok) return callback("Error in team.info: " + body.error);

        var teamId = body.team.id;

        var installation: Installation = {
          accessToken: tok,
          teamId: teamId,
          channelId: channelId
        };

        // Now save!
        this.installations.insertOne(installation, (err) => {
          if(err) return callback(err);
          callback();
        })
      });
    });
  }

  protected getInstallation(teamId: string, channelId: string, callback: GetInstallationCallback) {
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