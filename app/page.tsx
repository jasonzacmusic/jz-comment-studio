'use client';
import { useState, useEffect } from 'react';

type CommentType = 'video_comment' | 'community_post' | 'reply';

type Comment = {
  id: string; threadId: string; videoId: string | null; videoTitle: string;
  type: CommentType; typeLabel: string;
  author: string; firstName: string; text: string; likes: number; publishedAt: string;
  parentAuthor: string | null; parentText: string | null;
  status: 'pending'|'generating'|'approved'|'posting'|'posted'|'skipped';
  reply: string;
};

const TYPE_CONFIG: Record<CommentType, { color: string; bg: string; icon: string }> = {
  video_comment: { color: '#f0b429', bg: 'rgba(240,180,41,.12)', icon: '📹' },
  community_post: { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '📢' },
  reply:          { color: '#38bdf8', bg: 'rgba(56,189,248,.12)',  icon: '↩️' },
};

export default function Home() {
  const [connected, setConnected] = useState<boolean|null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [extra, setExtra] = useState('');
  const [log, setLog] = useState<{t:string;m:string;c:string}[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all'|CommentType>('all');
  const [lastFetch, setLastFetch] = useState<string|null>(null);

  const addLog = (m:string, c='info') => setLog(l => [...l.slice(-40), {t: new Date().toLocaleTimeString('en',{hour12:false}), m, c}]);

  useEffect(() => {
    fetch('/api/auth/status').then(r=>r.json()).then(d => {
      setConnected(d.connected);
      if (d.lastFetch) setLastFetch(d.lastFetch);
    });
    const p = new URLSearchParams(window.location.search);
    if (p.get('connected')==='true') { setConnected(true); window.history.replaceState({},'','/'); }
    const err = p.get('error');
    if (err === 'access_denied') addLog('⚠ Access denied — add music@nathanielschool.com as test user at: console.cloud.google.com/auth/audience?project=jz-comment-studio', 'err');
    else if (err) addLog('Auth error: '+err, 'err');
  }, []);

  const filtered = activeFilter === 'all' ? comments : comments.filter(c => c.type === activeFilter);

  const counts = {
    all: comments.length,
    video_comment: comments.filter(c=>c.type==='video_comment').length,
    community_post: comments.filter(c=>c.type==='community_post').length,
    reply: comments.filter(c=>c.type==='reply').length,
  };

  const stats = {
    approved: comments.filter(c=>c.status==='approved').length,
    posted: comments.filter(c=>c.status==='posted').length,
  };

  async function fetchComments() {
    setLoading(true);
    addLog(`Fetching up to ${batchSize} unresponded comments...`);
    try {
      const r = await fetch(`/api/comments?max=${batchSize}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const mapped: Comment[] = d.comments.map((c:any) => ({...c, status:'pending', reply:''}));
      setComments(mapped);
      setLastFetch(new Date().toLocaleString());
      addLog(`✓ Loaded ${mapped.length} comments (${d.comments.filter((c:any)=>c.type==='video_comment').length} video, ${d.comments.filter((c:any)=>c.type==='reply').length} replies, ${d.comments.filter((c:any)=>c.type==='community_post').length} community)`, 'ok');
    } catch(e:any) { addLog('✗ '+e.message, 'err'); }
    setLoading(false);
  }

  async function generateOne(i: number) {
    const ci = comments.findIndex((_,idx) => idx===i);
    setComments(cs => cs.map((c,j) => j===ci ? {...c, status:'generating'} : c));
    try {
      const c = comments[ci];
      const r = await fetch('/api/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment: c, extraInstructions: extra})
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setComments(cs => cs.map((c,j) => j===ci ? {...c, status:'pending', reply:d.reply} : c));
      addLog(`✓ ${comments[ci].firstName||comments[ci].author}: "${d.reply.substring(0,50)}"`, 'ok');
    } catch(e:any) {
      setComments(cs => cs.map((c,j) => j===ci ? {...c, status:'pending'} : c));
      addLog('✗ '+e.message, 'err');
    }
  }

  async function generateAll() {
    const pending = comments.map((c,i)=>({c,i})).filter(({c})=>c.status==='pending'&&!c.reply);
    if (!pending.length) return;
    addLog(`Generating ${pending.length} replies...`);
    for (const {i} of pending) { await generateOne(i); await new Promise(r=>setTimeout(r,200)); }
    addLog('✓ Generation complete', 'ok');
  }

  function approveOne(i:number, text?:string) {
    setComments(cs => cs.map((c,j) => j===i ? {...c, status:'approved', reply:text||c.reply} : c));
  }

  function approveAll() {
    setComments(cs => cs.map(c => c.status==='pending' && c.reply.trim() ? {...c, status:'approved'} : c));
  }

  async function postOne(i:number) {
    const c = comments[i];
    setComments(cs => cs.map((c,j) => j===i ? {...c, status:'posting'} : c));
    try {
      const r = await fetch('/api/reply', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment:c, replyText:c.reply})
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'posted'} : c));
      addLog(`✓ Posted → ${c.firstName||c.author}`, 'ok');
    } catch(e:any) {
      setComments(cs => cs.map((c,j) => j===i ? {...c, status:'approved'} : c));
      addLog('✗ '+e.message, 'err');
    }
  }

  async function postApproved() {
    const approved = comments.map((c,i)=>({c,i})).filter(({c})=>c.status==='approved');
    addLog(`Posting ${approved.length}...`);
    for (const {i} of approved) { await postOne(i); await new Promise(r=>setTimeout(r,700)); }
    addLog('✓ All posted!', 'ok');
  }

  const done = comments.filter(c=>c.status==='posted'||c.status==='skipped').length;
  const pct = comments.length ? Math.round(done/comments.length*100) : 0;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Fraunces:opsz,wght@9..144,300;9..144,700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Mono',monospace;background:#0c0c0e;color:#e4e4ec;font-size:12.5px;}
    button{cursor:pointer;font-family:'DM Mono',monospace;border:none;border-radius:8px;font-size:11.5px;font-weight:500;padding:8px 13px;transition:all .15s;}
    button:disabled{opacity:.35;cursor:not-allowed;}
    input,textarea,select{background:#1c1c23;border:1px solid #27272f;color:#e4e4ec;padding:8px 11px;border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;outline:none;width:100%;}
    input:focus,textarea:focus,select:focus{border-color:#f0b429;}
    textarea{resize:vertical;line-height:1.5;}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#27272f;border-radius:2px;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:css}}/>

      {/* HEADER */}
      <div style={{background:'#15151a',borderBottom:'1px solid #27272f',padding:'13px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{fontFamily:'Fraunces,serif',fontSize:19,fontWeight:700,color:'#f0b429'}}>
          JZ Comment Studio <span style={{color:'#5e5e6e',fontSize:11,fontFamily:'DM Mono,monospace',fontWeight:300,marginLeft:8}}>// reply at scale</span>
        </div>
        <div style={{display:'flex',gap:24,alignItems:'center'}}>
          {lastFetch && <div style={{fontSize:10,color:'#5e5e6e'}}>Last fetch: {lastFetch}</div>}
          {[['total',comments.length,'#f0b429'],['approved',stats.approved,'#3dd68c'],['posted',stats.posted,'#a78bfa']].map(([l,n,c])=>(
            <div key={l as string} style={{textAlign:'right'}}>
              <div style={{fontFamily:'Fraunces,serif',fontSize:17,fontWeight:700,color:c as string}}>{n as number}</div>
              <div style={{fontSize:9,color:'#5e5e6e',textTransform:'uppercase',letterSpacing:1}}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',height:'calc(100vh - 55px)',overflow:'hidden'}}>

        {/* LEFT */}
        <div style={{background:'#15151a',borderRight:'1px solid #27272f',overflowY:'auto',padding:18,display:'flex',flexDirection:'column',gap:16}}>

          {/* Connection */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>YouTube Connection</div>
            {connected===null ? <div style={{color:'#5e5e6e',fontSize:11}}>Checking...</div>
            : connected ? (
              <div style={{background:'rgba(61,214,140,.1)',border:'1px solid rgba(61,214,140,.25)',borderRadius:8,padding:'9px 12px',fontSize:11,color:'#3dd68c'}}>
                ✓ Connected · Auto-fetches daily at 8am UTC
              </div>
            ) : (
              <a href="/api/auth/connect" style={{textDecoration:'none'}}>
                <button style={{background:'#f0b429',color:'#000',width:'100%',fontWeight:700}}>🔗 Connect YouTube Account</button>
              </a>
            )}
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* Fetch */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Fetch Comments</div>
            <div style={{marginBottom:9}}>
              <label style={{fontSize:10.5,color:'#5e5e6e',display:'block',marginBottom:5}}>Batch size</label>
              <select value={batchSize} onChange={e=>setBatchSize(+e.target.value)}>
                <option value={20}>20 comments</option>
                <option value={50}>50 comments</option>
                <option value={100}>100 comments</option>
                <option value={200}>200 comments</option>
              </select>
            </div>
            <button onClick={fetchComments} disabled={!connected||loading}
              style={{background:'#f0b429',color:'#000',width:'100%',fontWeight:700,padding:'9px',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
              {loading ? <><span style={{animation:'spin 1s linear infinite',display:'inline-block'}}>⟳</span> Fetching...</> : '📥 Fetch Unresponded'}
            </button>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* Filter by type */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Filter by Type</div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {[
                ['all','All Comments','#e4e4ec','rgba(228,228,236,.08)','💬'],
                ['video_comment','Video Comments','#f0b429','rgba(240,180,41,.1)','📹'],
                ['reply','Replies to Others','#38bdf8','rgba(56,189,248,.1)','↩️'],
                ['community_post','Community Posts','#a78bfa','rgba(167,139,250,.1)','📢'],
              ].map(([key,label,color,bg,icon]) => (
                <button key={key} onClick={()=>setActiveFilter(key as any)}
                  style={{background:activeFilter===key ? bg as string : 'transparent', color:activeFilter===key ? color as string : '#5e5e6e',
                    border:`1px solid ${activeFilter===key ? color as string : '#27272f'}`,
                    padding:'7px 10px',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',borderRadius:7}}>
                  <span>{icon} {label}</span>
                  <span style={{background:'rgba(255,255,255,.08)',padding:'1px 7px',borderRadius:10,fontSize:10}}>
                    {counts[key as keyof typeof counts] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* Generate */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Generate Replies</div>
            <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={3}
              placeholder="Extra instructions (optional)" style={{marginBottom:9}}/>
            <button onClick={generateAll} disabled={!comments.length}
              style={{background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',width:'100%',padding:'9px'}}>
              ✨ Generate All Replies
            </button>
          </div>

          <div style={{height:1,background:'#27272f'}}/>

          {/* Post */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Review & Post</div>
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

          {/* Log */}
          <div>
            <div style={{fontSize:9.5,textTransform:'uppercase',letterSpacing:1.5,color:'#5e5e6e',marginBottom:8}}>Log</div>
            <div style={{background:'#1c1c23',border:'1px solid #27272f',borderRadius:8,padding:'9px 11px',fontSize:10.5,maxHeight:130,overflowY:'auto',lineHeight:1.9}}>
              {log.length===0 ? <span style={{color:'#5e5e6e'}}>Ready.</span> : log.map((l,i)=>(
                <div key={i} style={{color:l.c==='ok'?'#3dd68c':l.c==='err'?'#e85d4a':'#f0b429'}}>[{l.t}] {l.m}</div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Toolbar */}
          <div style={{background:'#15151a',borderBottom:'1px solid #27272f',padding:'10px 18px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:1,height:3,background:'#1c1c23',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',background:'#f0b429',borderRadius:2,width:pct+'%',transition:'width .4s'}}/>
              </div>
              <span style={{fontSize:10,color:'#5e5e6e',whiteSpace:'nowrap'}}>{done} / {comments.length}</span>
            </div>
            <button onClick={approveAll} style={{background:'transparent',color:'#e4e4ec',border:'1px solid #27272f',fontSize:10.5,padding:'6px 12px'}}>✓ Approve All</button>
          </div>

          {/* Comment list */}
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
            {filtered.length===0 ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:10,color:'#5e5e6e',textAlign:'center',padding:40}}>
                <div style={{fontSize:44,opacity:.25}}>💬</div>
                <div style={{fontFamily:'Fraunces,serif',fontSize:18,color:'#e4e4ec',opacity:.4}}>
                  {comments.length===0 ? 'No comments loaded' : `No ${activeFilter.replace('_',' ')}s`}
                </div>
                <div style={{fontSize:11,lineHeight:1.65,maxWidth:280}}>
                  {comments.length===0 ? 'Connect YouTube and fetch comments to start.' : 'Switch filter to see other comment types.'}
                </div>
              </div>
            ) : filtered.map((c,fi) => {
              const gi = comments.indexOf(c);
              return <CommentCard key={c.id} c={c} onGenerate={()=>generateOne(gi)}
                onApprove={(t)=>approveOne(gi,t)} onPost={()=>postOne(gi)}
                onSkip={()=>setComments(cs=>cs.map((x,j)=>j===gi?{...x,status:'skipped'}:x))}
                onChange={(reply)=>setComments(cs=>cs.map((x,j)=>j===gi?{...x,reply}:x))}/>;
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function CommentCard({c,onGenerate,onApprove,onPost,onSkip,onChange}:{
  c:Comment; onGenerate:()=>void; onApprove:(t:string)=>void;
  onPost:()=>void; onSkip:()=>void; onChange:(t:string)=>void;
}) {
  const tc = TYPE_CONFIG[c.type];
  const bdr = c.status==='approved'?'#3dd68c':c.status==='posted'?'#3dd68c':'#333340';

  return (
    <div style={{
      border:`1px solid ${bdr}`,
      borderRadius:8,
      marginBottom:4,
      overflow:'hidden',
      opacity: c.status==='skipped'?0.4:1,
      fontFamily:'monospace',
    }}>
      {/* TOP BAR */}
      <div style={{
        padding:'6px 12px',
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        background: c.type==='video_comment'?'#1a1a10':c.type==='reply'?'#0d1620':'#120d20',
        borderBottom:'1px solid #333340',
      }}>
        <span style={{fontSize:11,fontWeight:'bold',color:tc.color}}>
          {tc.icon} {c.typeLabel}
        </span>
        <span style={{fontSize:10,color:'#888'}}>{timeAgo(c.publishedAt)}</span>
      </div>

      {/* PARENT CONTEXT for replies */}
      {c.type==='reply' && c.parentText && (
        <div style={{padding:'5px 12px',background:'#0a0a14',borderBottom:'1px solid #222'}}>
          <span style={{fontSize:11,color:'#38bdf8'}}>↩ {c.parentAuthor}: </span>
          <span style={{fontSize:11,color:'#777'}}>"{c.parentText}"</span>
        </div>
      )}

      {/* COMMENT BODY */}
      <div style={{padding:'10px 12px',background:'#111118',borderBottom:'1px solid #222'}}>
        <div style={{
          fontSize:12,
          fontWeight:'bold',
          color:'#ffffff',
          marginBottom:4,
        }}>
          {c.author}
          {c.videoTitle && c.type!=='community_post' && (
            <span style={{fontWeight:'normal',fontSize:10,color:'#666',marginLeft:8}}>
              on: {c.videoTitle.substring(0,50)}
            </span>
          )}
        </div>
        <div style={{
          fontSize:13,
          color:'#dddddd',
          lineHeight:1.5,
          wordBreak:'break-word',
          whiteSpace:'pre-wrap',
        }}>
          {c.text || '(no text)'}
        </div>
        {c.likes>0 && <div style={{fontSize:10,color:'#666',marginTop:4}}>👍 {c.likes}</div>}
      </div>

      {/* REPLY AREA */}
      {c.status!=='skipped' && c.status!=='posted' && (
        <div style={{padding:'10px 12px',background:'#0c0c14'}}>
          <textarea
            value={c.reply}
            onChange={e=>onChange(e.target.value)}
            placeholder="Write or generate a reply..."
            rows={2}
            style={{
              width:'100%',
              background:'#1a1a28',
              color:'#ffffff',
              border:'1px solid #333',
              borderRadius:6,
              padding:'7px 10px',
              fontSize:12,
              fontFamily:'monospace',
              lineHeight:1.5,
              resize:'vertical',
              display:'block',
              marginBottom:8,
              boxSizing:'border-box',
            }}
          />
          <div style={{display:'flex',gap:6}}>
            <button onClick={onGenerate}
              style={{flex:1,background:'#222',color:'#ccc',border:'1px solid #444',borderRadius:6,padding:'7px',fontSize:11,cursor:'pointer'}}>
              ✨ Generate
            </button>
            {c.status==='approved'
              ? <button onClick={onPost}
                  style={{flex:2,background:'#0d2a1a',color:'#3dd68c',border:'1px solid #3dd68c',borderRadius:6,padding:'7px',fontSize:11,fontWeight:'bold',cursor:'pointer'}}>
                  🚀 Post Reply
                </button>
              : <button onClick={()=>onApprove(c.reply)}
                  style={{flex:2,background:'#0d2a1a',color:'#3dd68c',border:'1px solid #2a5a3a',borderRadius:6,padding:'7px',fontSize:11,cursor:'pointer'}}>
                  ✓ Approve
                </button>
            }
            <button onClick={onSkip}
              style={{flex:1,background:'#1a0d0d',color:'#e85d4a',border:'1px solid #3a2020',borderRadius:6,padding:'7px',fontSize:11,cursor:'pointer'}}>
              ✗ Skip
            </button>
          </div>
        </div>
      )}

      {c.status==='posted' && (
        <div style={{padding:'8px 12px',background:'#0a1a10',fontSize:11,color:'#3dd68c'}}>
          ✓ Reply posted: {c.reply}
        </div>
      )}

      {c.status==='skipped' && (
        <div style={{padding:'6px 12px',background:'#111',fontSize:10,color:'#555'}}>
          skipped
        </div>
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
