/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

// A page that takes a few seconds to arrive, so a running macro can be stopped.
let gTimer;

function handleRequest(request, response) {
  response.processAsync();
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  gTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gTimer.initWithCallback(
    () => {
      response.write("<!doctype html><title>Slow</title><p>Slow page</p>");
      response.finish();
    },
    4000,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
