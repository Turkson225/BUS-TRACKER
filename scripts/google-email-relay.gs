// Paste into a Google Apps Script project owned by the company email account.
// The shared secret belongs in Script Properties, never in the web frontend.
function initializeRelay() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ONROUTE_SECRET')) {
    props.setProperty('ONROUTE_SECRET', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  }
  // Requests mail permission without sending a message.
  MailApp.getRemainingDailyQuota();
  console.log('Initialized. Copy ONROUTE_SECRET from Project Settings > Script Properties into the Site server secret.');
}
function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var lock = null, claimedKey = null, sending = false;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 10000) return reply_({ok:false});
    var data = JSON.parse(raw), props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('ONROUTE_SECRET');
    if (!secret || secret.length < 32 || typeof data.secret !== 'string' || data.secret !== secret) return reply_({ok:false});
    if (!/^[0-9a-f-]{36}$/i.test(data.eventId || '') || typeof data.to !== 'string' || !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(data.to) || data.to.length > 254 || typeof data.subject !== 'string' || !data.subject || data.subject.length > 200 || /[\r\n]/.test(data.subject) || typeof data.body !== 'string' || data.body.length > 4000) return reply_({ok:false});
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return reply_({ok:false});
    var now = Date.now(), all = props.getProperties();
    Object.keys(all).forEach(function(key) { if (key.indexOf('EVENT_') === 0) { try {if (now - JSON.parse(all[key]).time > 86400000) props.deleteProperty(key);} catch (_) {} } });
    var key = 'EVENT_' + data.eventId, prior = props.getProperty(key);
    if (prior) {
      var state = JSON.parse(prior);
      return reply_(state.status === 'sent' ? {ok:true,eventId:data.eventId} : {ok:false,eventId:data.eventId,uncertain:true});
    }
    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ok:false});
    // Reserve before calling the mail service. A repeated request with an
    // uncertain result never sends a second copy automatically.
    props.setProperty(key, JSON.stringify({status:'reserved',time:now}));
    claimedKey = key;
    sending = true;
    MailApp.sendEmail({to:data.to,subject:data.subject,body:data.body,name:'OnRoute bus alerts'});
    sending = false;
    props.setProperty(key, JSON.stringify({status:'sent',time:now}));
    return reply_({ok:true,eventId:data.eventId});
  } catch (_) {
    // Keep the reservation when sendEmail may have been called. An operator
    // should check the sender account before retrying an uncertain delivery.
    return reply_({ok:false,uncertain:!!claimedKey});
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function doGet() { return reply_({ok:false,message:'POST requests only.'}); }
