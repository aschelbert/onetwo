/* Shows the current free trial on the marketing pages.
   What the page says is a fallback written at build time; this asks the
   backend for the live value (set in the Admin Console) and updates it.
   With a trial: every <span data-trial-days> gets the number of days.
   With the trial off (0): every element with data-no-trial takes that
   attribute as its text, for example "Start today!".
   /site-config.js, generated at build, says where the backend is. */
(function () {
  var site = window.ONETWO_SITE || {};
  if (!site.supabaseUrl || !site.anonKey || !window.fetch) return;
  fetch(site.supabaseUrl + '/rest/v1/rpc/get_trial_days', {
    method: 'POST',
    headers: { apikey: site.anonKey, Authorization: 'Bearer ' + site.anonKey, 'Content-Type': 'application/json' },
    body: '{}'
  })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (days) {
      if (typeof days !== 'number' || days < 0 || days % 1 !== 0) return;
      var i, spots;
      if (days > 0) {
        spots = document.querySelectorAll('[data-trial-days]');
        for (i = 0; i < spots.length; i++) spots[i].textContent = String(days);
      } else {
        spots = document.querySelectorAll('[data-no-trial]');
        for (i = 0; i < spots.length; i++) spots[i].textContent = spots[i].getAttribute('data-no-trial');
      }
    })
    .catch(function () { /* keep the fallback */ });
})();
