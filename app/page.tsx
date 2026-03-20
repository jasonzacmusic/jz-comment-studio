'use client';
import { useState, useEffect, useCallback } from 'react';

type Comment = {
  id: string; threadId: string; videoId: string; videoTitle: string;
  author: string; firstName: string; text: string; likes: number; publishedAt: string;
  status: 'pending'|'generating'|'approved'|'posting'|'posted'|'skipped';
  reply: string;
};

const S: Record<string, string> = {
  pending:'#5e5e6e', generating:'#f0b429', approved:'#3dd68c', posting:'#f0b429', posted:'#3dd68c', skipped:'#3a3a45'
};

export default function Home() {
  const [connected, setConnected] = useState<boolean|null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [extra, setExtra] = useState('');
  const [log, setLog] = useState<{t:string;m:string;c:string}[]>([]);
  const [stats, setStats] = useState({total:0,approved:0,posted:0});

  const addLog = (m:string, c='info') => setLog(l => [...l.slice(-30), {t:new Date().toLocaleTimeString('en',{hour12:false}), m, c}]);

  useEffect(() => {
    fetch('/api/auth/status').then(r=>r.json()).then(d=>setConnected(d.connected));
    const p = new URLSearchParams(window.location.search);
    if(p.get('connected')==='true'){setConnected(true);window.history.replaceState({},'','/');}
    if(p.get('error')){addLog('Auth error: '+p.get('error'),'err');}
  }, []);

  useEffect(() => {
    setStats({
      total: comments.length,
      approved: comments.filter(c=>c.status==='approved').length,
      posted: comments.filter(c=>c.status==='posted').length,
    });
  }, [comments]);

  async function fetchComments() {
    setLoading(true);
    addLog(`Fetching up to ${batchSize} unresponded comments...`);
    try {
      const r = await fetch(`/api/comments?max=${batchSize}`);
      const d = await r.json();
      if(!d.ok) throw new Error(d.error);
      const mapped: Comment[] = d.comments.map((c:any) => ({...c, status:'pending', reply:''}));
      setComments(mapped);
      addLog(`✓ Loaded ${mapped.length} unresponded comments`, 'ok');
    } catch(e:any) {
      addLog('✗ '+e.message, 'err');
    }
    setLoading(false);
  }

  async function generateOne(i: number) {
    setComments(cs => cs.map((c,j) => j===i ? {...c, status:'generating'} : c));
    try {
      const c = comments[i];
      const r = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment: c, extraInstructions: extra})
      });
      const d = await r.json();
      if(!d.ok) throw new Error(d.error);
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'pending', reply:d.reply} : c));
      addLog(`✓ ${comments[i].firstName||comments[i].author}: "${d.reply.substring(0,50)}"`, 'ok');
    } catch(e:any) {
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'pending'} : c));
      addLog('✗ '+e.message, 'err');
    }
  }

  async function generateAll() {
    const pending = comments.map((c,i)=>({c,i})).filter(({c})=>c.status==='pending'&&!c.reply);
    addLog(`Generating ${pending.length} replies...`);
    for(const {i} of pending) {
      await generateOne(i);
      await new Promise(r=>setTimeout(r,200));
    }
    addLog('✓ Generation complete', 'ok');
  }

  function approveOne(i:number, text?:string) {
    setComments(cs => cs.map((c,j) => j===i ? {...c, status:'approved', reply:text||c.reply} : c));
  }

  function approveAll() {
    setComments(cs => cs.map(c => c.status==='pending'&&c.reply.trim() ? {...c, status:'approved'} : c));
  }

  async function postOne(i:number) {
    const c = comments[i];
    setComments(cs => cs.map((c,j) => j===i ? {...c, status:'posting'} : c));
    try {
      const r = await fetch('/api/reply', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment:c, replyText:c.reply})
      });
      const d = await r.json();
      if(!d.ok) throw new Error(d.error);
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'posted'} : c));
      addLog(`✓ Posted → ${c.firstName||c.author}`, 'ok');
    } catch(e:any) {
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'approved'} : c));
      addLog('✗ Post failed: '+e.message, 'err');
    }
  }

  async function postApproved() {
    const approved = comments.map((c,i)=>({c,i})).filter(({c})=>c.status==='approved');
    addLog(`Posting ${approved.length}...`);
    for(const {i} of approved) { await postOne(i); await new Promise(r=>setTimeout(r,700)); }
    addLog('✓ All posted!', 'ok');
  }

  const done = comments.filter(c=>c.status==='posted'||c.status==='skipped').length;
  const pct = comments.length ? Math.round(done/comments.length*100) : 0;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Fraunces:opsz,wght@9..144,300;9..144,700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    :root{--bg:#0c0c0e;--s:#15151a;--s2:#1c1c23;--b:#27272f;--a:#f0b429;--g:#3dd68c;--r:#e85d4a;--t:#e4e4ec;--m:#5e5e6e;}
    body{font-family:'DM Mono',monospace;background:var(--bg);color:var(--t);font-size:12.5px;}
    input,textarea,select{background:var(--s2);border:1px solid var(--b);color:var(--t);padding:8px 10px;border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;outline:none;width:100%;transition:border-color .15s;}
    input:focus,textarea:focus,select:focus{border-color:var(--a);}
    textarea{resize:vertical;line-height:1.5;}
    button{cursor:pointer;font-family:'DM Mono',monospace;border:none;border-radius:8px;font-size:11.5px;font-weight:500;padding:8px 13px;transition:all .15s;}
    button:disabled{opacity:.35;cursor:not-allowed;}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:var(--b);border-radius:2px;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:css}} />
      {/* HEADER */}
      <div style={{background:'#15151a',borderBottom:'1px solid #27272f',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{fontFamily:'Fraunces,serif',fontSize:19,fontWeight:700,color:'#f0b429'}}>
          JZ Comment Studio <span style={{color:'#5e5e6e',fontSize:11,fontWeight:300,fontFamily:'DM Mono,monospace',marginLeft:8}}>// reply at scale</span>
        </div>
        <div style={{display:'flex',gap:24}}>
          {[['total',stats.total,'#f0b429'],['approved',stats.approved,'#3dd68c'],['posted',stats.posted,'#f0b429']].map(([l,n,c])=>(
            <div key={l as string} style={{textAlign:'right'}}>
              <div style={{fontFamily:'Fraunces,serif',fontSize:17,fontWeight:700,color:c as string}}>{n as number}</div>
              <div style={{fontSize:9,color:'#5e5e6e',textTransform:'uppercase',letterSpacing:1}}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* LAYOUT */}
      <div style={{display:'grid',gridTemplateColumns:'290px 1fr',height:'calc(100vh - 55px)',overflow:'hidden'}}>
        
        {/* LEFT PANEL */}
        <div style={{background:'#15151a',borderRight:'1px solid #27272f',overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:16}}>
          
          {/* CONNECTION */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>① YouTube Connection</div>
            {connected === null ? (
              <div style={{color:'#5e5e6e',fontSize:11}}>Checking...</div>
            ) : connected ? (
              <div style={{background:'rgba(61,214,140,.1)',border:'1px solid rgba(61,214,140,.25)',borderRadius:8,padding:'10px 12px',fontSize:11,color:'#3dd68c'}}>
                ✓ Connected as Jason Zac<br/>
                <span style={{color:'#5e5e6e',fontSize:10}}>Token auto-refreshes — permanent access</span>
              </div>
            ) : (
              <div>
                <div style={{background:'rgba(240,180,41,.07)',border:'1px solid rgba(240,180,41,.18)',borderRadius:8,padding:'10px 12px',fontSize:11,color:'#c8a830',marginBottom:10,lineHeight:1.65}}>
                  Connect once — stored permanently in Neon.<br/>Never need to do this again.
                </div>
                <a href="/api/auth/connect" style={{display:'block',textDecoration:'none'}}>
                  <button style={{background:'#f0b429',color:'#000',width:'100%',padding:'10px',fontWeight:700}}>
                    🔗 Connect YouTube Account
                  </button>
                </a>
              </div>
            )}
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* FETCH */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>② Fetch Comments</div>
            <div style={{marginBottom:9}}>
              <label style={{fontSize:10.5,color:'#5e5e6e',display:'block',marginBottom:5}}>Batch size</label>
              <select value={batchSize} onChange={e=>setBatchSize(+e.target.value)}>
                <option value={20}>20 comments</option>
                <option value={50}>50 comments</option>
                <option value={100}>100 comments</option>
                <option value={200}>200 comments</option>
              </select>
            </div>
            <button
              onClick={fetchComments} disabled={!connected||loading}
              style={{background:'#f0b429',color:'#000',width:'100%',fontWeight:700,padding:'9px'}}>
              {loading ? '⏳ Fetching...' : '📥 Fetch Unresponded'}
            </button>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* GENERATE */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>③ Generate Replies</div>
            <div style={{marginBottom:9}}>
              <label style={{fontSize:10.5,color:'#5e5e6e',display:'block',marginBottom:5}}>Extra instructions (optional)</label>
              <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={3}
                placeholder="e.g. 'If they ask about India pricing, mention ₹50,000 for Roland FP-30'" />
            </div>
            <button onClick={generateAll} disabled={!comments.length}
              style={{background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',width:'100%',padding:'9px'}}>
              ✨ Generate All Replies
            </button>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* POST */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>④ Review & Post</div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              <button onClick={approveAll} disabled={!comments.length}
                style={{background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',padding:'8px'}}>
                ✓ Approve All Generated
              </button>
              <button onClick={postApproved} disabled={!comments.some(c=>c.status==='approved')}
                style={{background:'rgba(61,214,140,.12)',color:'#3dd68c',border:'1px solid rgba(61,214,140,.25)',padding:'8px',fontWeight:600}}>
                🚀 Post All Approved
              </button>
              <button onClick={()=>setComments(cs=>cs.map(c=>c.status==='pending'?{...c,status:'skipped'}:c))}
                style={{background:'rgba(232,93,74,.1)',color:'#e85d4a',border:'1px solid rgba(232,93,74,.25)',padding:'8px'}}>
                ⏭ Skip Remaining
              </button>
            </div>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* LOG */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Log</div>
            <div style={{background:'#1c1c23',border:'1px solid #27272f',borderRadius:8,padding:'9px 11px',fontSize:10.5,maxHeight:130,overflowY:'auto',lineHeight:1.9}}>
              {log.length===0 ? <span style={{color:'#5e5e6e'}}>Ready.</span> : log.map((l,i)=>(
                <div key={i} style={{color:l.c==='ok'?'#3dd68c':l.c==='err'?'#e85d4a':'#f0b429'}}>
                  [{l.t}] {l.m}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Toolbar */}
          <div style={{background:'#15151a',borderBottom:'1px solid #27272f',padding:'10px 18px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:1,height:3,background:'#1c1c23',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',background:'#f0b429',borderRadius:2,width:pct+'%',transition:'width .4s'}}/>
              </div>
              <span style={{fontSize:10,color:'#5e5e6e',whiteSpace:'nowrap'}}>{done} / {comments.length}</span>
            </div>
            <button onClick={approveAll} style={{background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',fontSize:10.5,padding:'6px 12px'}}>
              ✓ Approve All
            </button>
          </div>

          {/* Comments list */}
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
            {comments.length===0 ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:10,color:'#5e5e6e',textAlign:'center',padding:40}}>
                <div style={{fontSize:44,opacity:.25}}>💬</div>
                <div style={{fontFamily:'Fraunces,serif',fontSize:18,color:'#e4e4ec',opacity:.4}}>No comments loaded</div>
                <div style={{fontSize:11,lineHeight:1.65,maxWidth:280}}>Connect your YouTube account, then click "Fetch Unresponded" to start.</div>
              </div>
            ) : comments.map((c,i) => (
              <CommentCard key={c.id} c={c} i={i}
                onGenerate={()=>generateOne(i)}
                onApprove={(text)=>approveOne(i,text)}
                onPost={()=>postOne(i)}
                onSkip={()=>setComments(cs=>cs.map((c,j)=>j===i?{...c,status:'skipped'}:c))}
                onChange={(reply)=>setComments(cs=>cs.map((c,j)=>j===i?{...c,reply}:c))}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function CommentCard({c,i,onGenerate,onApprove,onPost,onSkip,onChange}: {
  c:Comment; i:number;
  onGenerate:()=>void; onApprove:(t:string)=>void;
  onPost:()=>void; onSkip:()=>void; onChange:(t:string)=>void;
}) {
  const statusColor = S[c.status] || '#5e5e6e';
  const statusLabel = {pending:'pending',generating:'writing…',approved:'approved',posting:'posting…',posted:'✓ posted',skipped:'skipped'}[c.status];
  const age = timeAgo(c.publishedAt);
  const bdr = c.status==='approved'?'rgba(61,214,140,.35)':c.status==='posted'?'rgba(61,214,140,.5)':'#27272f';
  const bg = c.status==='posted'?'rgba(61,214,140,.03)':'#15151a';
  const op = c.status==='skipped'?.35:1;

  return (
    <div style={{background:bg,border:`1px solid ${bdr}`,borderRadius:9,overflow:'hidden',opacity:op,transition:'border-color .15s'}}>
      {/* Header */}
      <div style={{padding:'11px 14px',display:'flex',gap:11,alignItems:'flex-start',borderBottom:'1px solid #27272f'}}>
        <div style={{width:30,height:30,borderRadius:'50%',background:'#1c1c23',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontSize:14,color:'#f0b429',fontWeight:700,flexShrink:0}}>
          {(c.firstName||c.author||'?').charAt(0).toUpperCase()}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:500,fontSize:12}}>{c.author} <span style={{color:'#5e5e6e',fontSize:10}}>{age}</span></div>
          <div style={{fontSize:10,color:'#5e5e6e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2}}>📹 {c.videoTitle}</div>
          <div style={{fontSize:12.5,lineHeight:1.55,marginTop:5}}>{c.text}</div>
          {c.likes>0&&<div style={{fontSize:10,color:'#5e5e6e',marginTop:3}}>👍 {c.likes}</div>}
        </div>
        <div style={{fontSize:9,padding:'3px 8px',borderRadius:20,textTransform:'uppercase',letterSpacing:.5,flexShrink:0,fontWeight:500,background:statusColor+'22',color:statusColor,animation:c.status==='generating'?'pulse 1.4s infinite':undefined}}>
          {statusLabel}
        </div>
      </div>
      {/* Reply area */}
      {c.status!=='skipped'&&c.status!=='posted' ? (
        <div style={{padding:'11px 14px',display:'flex',flexDirection:'column',gap:9}}>
          <textarea rows={2} value={c.reply} onChange={e=>onChange(e.target.value)}
            placeholder="Generate or type a reply..."
            style={{fontSize:12,lineHeight:1.55,minHeight:58}} />
          <div style={{display:'flex',gap:7}}>
            <button onClick={onGenerate}
              style={{flex:1,background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',padding:'7px 10px',fontSize:10.5}}>
              ✨ Gen
            </button>
            {c.status==='approved' ? (
              <button onClick={onPost}
                style={{flex:2,background:'rgba(61,214,140,.12)',color:'#3dd68c',border:'1px solid rgba(61,214,140,.25)',padding:'7px 10px',fontSize:10.5,fontWeight:600}}>
                🚀 Post Now
              </button>
            ) : (
              <button onClick={()=>onApprove(c.reply)}
                style={{flex:2,background:'rgba(61,214,140,.12)',color:'#3dd68c',border:'1px solid rgba(61,214,140,.25)',padding:'7px 10px',fontSize:10.5}}>
                ✓ Approve
              </button>
            )}
            <button onClick={onSkip}
              style={{flex:1,background:'rgba(232,93,74,.1)',color:'#e85d4a',border:'1px solid rgba(232,93,74,.25)',padding:'7px 10px',fontSize:10.5}}>
              ✗
            </button>
          </div>
        </div>
      ) : c.status==='posted' ? (
        <div style={{padding:'8px 14px',fontSize:11,color:'#3dd68c'}}>✓ {c.reply}</div>
      ) : (
        <div style={{padding:'7px 14px',fontSize:10,color:'#5e5e6e'}}>skipped</div>
      )}
    </div>
  );
}

function timeAgo(iso:string){
  if(!iso)return'';
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
