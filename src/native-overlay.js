import { supportedUrl, settings } from './core.js';

export function sanitizeFrame(value) {
  const viewport=value?.viewport, board=value?.board;
  const finite=(v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (!viewport || !board || !finite(viewport.width,100,16000) || !finite(viewport.height,100,16000) || !finite(viewport.dpr,.5,8) ||
      !finite(board.left,-16000,16000) || !finite(board.top,-16000,16000) || !finite(board.width,100,8000) || !finite(board.height,100,8000)) return null;
  const square=v => /^[a-h][1-8]$/.test(v || '') ? v : null;
  const text=v => typeof v === 'string' ? v.slice(0,160) : '';
  return {type:'frame',visible:value.visible === true,flipped:value.flipped === true,darkMode:value.darkMode === true,
    viewport:{width:viewport.width,height:viewport.height,dpr:viewport.dpr},board:{left:board.left,top:board.top,width:board.width,height:board.height},
    from:square(value.from),to:square(value.to),color:/^#[0-9a-f]{6}$/i.test(value.color || '') ? value.color : '#ffbe55',
    move:text(value.move),detail:text(value.detail),evaluation:text(value.evaluation),status:text(value.status)};
}

export function installNativeOverlay(chrome) {
  let port, connecting, owner=null, epoch=0, lastAttempt=0;
  let status={ready:false,error:'Windows helper not connected.'};
  let enabled=false;
  const loaded=chrome.storage.local.get('settings').then(value => {enabled=settings(value.settings).privateOverlay;});
  const sequence=new Map();
  function hide(tab) {
    if (tab !== undefined && owner !== tab) return;
    try {port?.postMessage({type:'hide'});} catch {}
    owner=null;
  }
  function connect(force=false) {
    if (port && status.ready) return Promise.resolve(status);
    if (connecting) return connecting;
    if (!force && Date.now()-lastAttempt < 5000) return Promise.resolve(status);
    lastAttempt=Date.now();
    connecting=new Promise(resolve => {
      let settled=false;
      const finish=value => {if (settled) return; settled=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(() => {status={ready:false,error:'Windows helper did not respond.'};finish(status);port?.disconnect();},4000);
      try {
        const current=chrome.runtime.connectNative('com.gambaguette.overlay'); port=current;
        current.onMessage.addListener(message => {
          if (current !== port) return;
          if (message.type === 'hello') {
            status=message.ready && message.captureProtected ? {ready:true,captureProtected:true,process:message.process} : {ready:false,error:`Windows capture exclusion unavailable (${message.error || 'unsupported Windows version'}).`};
            finish(status);
            if (!status.ready) current.disconnect();
          } else if (message.type === 'error') {status={ready:false,error:message.error || 'Windows helper failed.'};finish(status);current.disconnect();}
        });
        current.onDisconnect.addListener(() => {
          const error=chrome.runtime.lastError?.message;
          if (current !== port) return;
          port=null;owner=null;
          status={ready:false,error:error || 'Windows helper disconnected.'};finish(status);
        });
      } catch(error) {status={ready:false,error:error.message};finish(status);}
    }).finally(() => {connecting=null;});
    return connecting;
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message?.target !== 'overlay' || sender.id !== chrome.runtime.id) return;
    const ownPage=sender.url?.startsWith(chrome.runtime.getURL(''));
    if (sender.tab && !supportedUrl(sender.url) && !ownPage) {respond({error:'Unsupported page.'});return;}
    if (message.action === 'status') {connect(message.connect === true).then(respond);return true;}
    if (!sender.tab || !supportedUrl(sender.url)) return;
    if (message.action === 'hide') {hide(sender.tab.id);respond({hidden:true});return;}
    if (message.action !== 'frame') return;
    const frame=sanitizeFrame(message.frame);
    if (!frame) {respond({error:'Invalid overlay frame.'});return;}
    const tabId=sender.tab.id, ticket=(sequence.get(tabId) ?? 0)+1;sequence.set(tabId,ticket);
    (async () => {
      await loaded;if (!enabled) return {ready:false};
      const [tab,window]=await Promise.all([chrome.tabs.get(tabId),chrome.windows.get(sender.tab.windowId)]);
      if (!tab.active || !window.focused || window.state === 'minimized') {hide(tabId);return {ready:false};}
      const currentEpoch=epoch, result=await connect();
      if (!result.ready || !enabled || currentEpoch !== epoch || sequence.get(tabId) !== ticket) return result;
      owner=tabId;port.postMessage(frame);return result;
    })().then(respond,error => respond({ready:false,error:error.message}));
    return true;
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'local' || !changes.settings) return;
    enabled=settings(changes.settings.newValue).privateOverlay;
    if (!enabled) {epoch++;hide();port?.disconnect();}
  });
  chrome.tabs.onActivated.addListener(() => {epoch++;hide();});
  chrome.tabs.onRemoved.addListener(tab => {sequence.delete(tab);hide(tab);});
  chrome.tabs.onUpdated.addListener((tab,change) => {if (change.status === 'loading') {epoch++;hide(tab);}});
  chrome.windows.onFocusChanged.addListener(() => {epoch++;hide();});
}
