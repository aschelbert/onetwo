/* Shows the current free trial length on the marketing pages.
   The number in the page is a fallback written at build time; this asks the
   backend for the live value (set in the Admin Console) and updates every
   <span data-trial-days>. /site-config.js, generated at build, says where
   the backend is. */
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
      // 0 means no free trial; the copy around the number would no longer make sense, so leave it.
      if (typeof days !== 'number' || days <= 0 || days % 1 !== 0) return;
      var spots = document.querySelectorAll('[data-trial-days]');
      for (var i = 0; i < spots.length; i++) spots[i].textContent = String(days);
    })
    .catch(function () { /* keep the fallback */ });
})();
