'use client';
import { useState, useEffect } from 'react';

type CommentType = 'video_comment' | 'community_post' | 'reply';
type Status = 'pending'|'generating'|'approved'|'posting'|'posted'|'skipped';

type Comment = {
  id: string; threadId: string; videoId: string|null; videoTitle: string;
  type: CommentType; typeLabel: string;
  author: string; firstName: string; text: string; likes: number; publishedAt: string;
  parentAuthor: string|null; parentText: string|null;
  status: Status; reply: string;
};

const TYPE_COLORS: Record<CommentType, string> = {
  video_comment: '#f0b429',
  community_post: '#a78bfa',
  reply: '#38bdf8',
};
const TYPE_ICONS: Record<CommentType, string> = {
  video_comment: '📹',
  community_post: '📢',
  reply: '↩️',
};
const STATUS_COLOR: Record<Status, string> = {
  pending: '#666680', generating: '#f0b429', approved: '#3dd68c',
  posting: '#f0b429', posted: '#3dd68c', skipped: '#444455',
};
const STATUS_LABEL: Record<Status, string> = {
  pending: 'pending', generating: 'writing…', approved: 'approved',
  posting: 'posting…', posted: '✓ posted', skipped: 'skipped',
};

export default function Home() {
  const [connected, setConnected] = useState<boolean|null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [extra, setExtra] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all'|CommentType>('all');

  const lg = (m: string) => setLog(l => [...l.slice(-50), `[${new Date().toLocaleTimeString('en',{hour12:false})}] ${m}`]);

  useEffect(() => {
    fetch('/api/auth/status').then(r=>r.json()).then(d => setConnected(d.connected));
    const p = new URLSearchParams(window.location.search);
    if (p.get('connected')==='true') { setConnected(true); window.history.replaceState({},'','/'); }
    if (p.get('error')==='access_denied') lg('⚠ Add music@nathanielschool.com as test user at Google Cloud Console');
    else if (p.get('error')) lg('Auth error: '+p.get('error'));
  }, []);

  // Update a single comment by id (avoids indexOf issue)
  const updateComment = (id: string, patch: Partial<Comment>) =>
    setComments(cs => cs.map(c => c.id === id ? {...c, ...patch} : c));

  const filtered = filter === 'all' ? comments : comments.filter(c => c.type === filter);
  const counts = {
    all: comments.length,
    video_comment: comments.filter(c=>c.type==='video_comment').length,
    community_post: comments.filter(c=>c.type==='community_post').length,
    reply: comments.filter(c=>c.type==='reply').length,
  };
  const approved = comments.filter(c=>c.status==='approved').length;
  const posted = comments.filter(c=>c.status==='posted').length;
  const done = comments.filter(c=>c.status==='posted'||c.status==='skipped').length;
  const pct = comments.length ? Math.round(done/comments.length*100) : 0;

  async function fetchComments() {
    setLoading(true);
    lg(`Fetching up to ${batchSize} comments...`);
    try {
      const r = await fetch(`/api/comments?max=${batchSize}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setComments(d.comments.map((c:any) => ({...c, status:'pending', reply:''})));
      lg(`✓ ${d.comments.length} comments loaded`);
    } catch(e:any) { lg('✗ '+e.message); }
    setLoading(false);
  }

  async function generateOne(id: string, comment: Comment) {
    updateComment(id, {status:'generating'});
    try {
      const r = await fetch('/api/generate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment, extraInstructions: extra})
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      updateComment(id, {status:'pending', reply: d.reply});
      lg(`✓ ${comment.firstName||comment.author}`);
    } catch(e:any) {
      updateComment(id, {status:'pending'});
      lg('✗ '+e.message);
    }
  }

  async function generateAll() {
    const pending = comments.filter(c=>c.status==='pending'&&!c.reply);
    lg(`Generating ${pending.length} replies...`);
    for (const c of pending) {
      await generateOne(c.id, c);
      await new Promise(r=>setTimeout(r,250));
    }
    lg('✓ Generation complete');
  }

  async function postOne(comment: Comment) {
    updateComment(comment.id, {status:'posting'});
    try {
      const r = await fetch('/api/reply', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({comment, replyText: comment.reply})
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      updateComment(comment.id, {status:'posted'});
      lg(`✓ Posted → ${comment.firstName||comment.author}`);
    } catch(e:any) {
      updateComment(comment.id, {status:'approved'});
      lg('✗ '+e.message);
    }
  }

  async function postApproved() {
    const toPost = comments.filter(c=>c.status==='approved');
    lg(`Posting ${toPost.length}...`);
    for (const c of toPost) { await postOne(c); await new Promise(r=>setTimeout(r,700)); }
    lg('✓ All posted!');
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>

      {/* ── HEADER ── */}
      <div style={{background:'#111118',borderBottom:'1px solid #2e2e3a',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{fontFamily:'Fraunces,serif',fontSize:18,fontWeight:700,color:'#f0b429'}}>
          JZ Comment Studio
          <span style={{fontFamily:'DM Mono,monospace',fontSize:11,fontWeight:300,color:'#555568',marginLeft:10}}>// reply at scale</span>
        </div>
        <div style={{display:'flex',gap:20}}>
          {([['fetched',comments.length,'#f0b429'],['approved',approved,'#3dd68c'],['posted',posted,'#a78bfa']] as [string,number,string][]).map(([l,n,c])=>(
            <div key={l} style={{textAlign:'right'}}>
              <div style={{fontFamily:'Fraunces,serif',fontSize:16,fontWeight:700,color:c}}>{n}</div>
              <div style={{fontSize:9,color:'#555568',textTransform:'uppercase',letterSpacing:1}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{width:260,background:'#111118',borderRight:'1px solid #2e2e3a',overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:14,flexShrink:0}}>

          {/* Connection */}
          <div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1.5,color:'#555568',marginBottom:6}}>Connection</div>
            {connected===null
              ? <div style={{fontSize:11,color:'#555568'}}>Checking...</div>
              : connected
              ? <div style={{background:'#0d1a10',border:'1px solid #1a3a20',borderRadius:7,padding:'8px 10px',fontSize:11,color:'#3dd68c'}}>✓ Connected · Auto-fetches daily</div>
              : <a href="/api/auth/connect" style={{textDecoration:'none',display:'block'}}>
                  <button style={{background:'#f0b429',color:'#000',width:'100%',fontWeight:700,fontSize:12}}>🔗 Connect YouTube</button>
                </a>
            }
          </div>

          <div style={{height:1,background:'#2e2e3a'}}/>

          {/* Fetch */}
          <div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1.5,color:'#555568',marginBottom:6}}>Fetch Comments</div>
            <select value={batchSize} onChange={e=>setBatchSize(+e.target.value)} style={{marginBottom:8}}>
              <option value={20}>20 comments</option>
              <option value={50}>50 comments</option>
              <option value={100}>100 comments</option>
              <option value={200}>200 comments</option>
            </select>
            <button onClick={fetchComments} disabled={!connected||loading}
              style={{background:'#f0b429',color:'#000',width:'100%',fontWeight:700}}>
              {loading ? '⟳ Fetching...' : '📥 Fetch Unresponded'}
            </button>
          </div>

          <div style={{height:1,background:'#2e2e3a'}}/>

          {/* Filter */}
          <div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1.5,color:'#555568',marginBottom:6}}>Filter by Type</div>
            {([['all','All','#aaaacc','💬'],['video_comment','Video','#f0b429','📹'],['reply','Replies','#38bdf8','↩️'],['community_post','Community','#a78bfa','📢']] as [string,string,string,string][]).map(([key,label,color,icon])=>(
              <button key={key} onClick={()=>setFilter(key as any)}
                style={{width:'100%',marginBottom:4,display:'flex',justifyContent:'space-between',
                  background: filter===key ? color+'18' : 'transparent',
                  color: filter===key ? color : '#666680',
                  border:`1px solid ${filter===key ? color+'60' : '#2e2e3a'}`,
                  padding:'6px 10px',textAlign:'left',borderRadius:6}}>
                <span>{icon} {label}</span>
                <span style={{background:'#ffffff12',borderRadius:10,padding:'0 6px',fontSize:10}}>
                  {counts[key as keyof typeof counts]??0}
                </span>
              </button>
            ))}
          </div>

          <div style={{height:1,background:'#2e2e3a'}}/>

          {/* Generate */}
          <div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1.5,color:'#555568',marginBottom:6}}>Generate</div>
            <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={2}
              placeholder="Extra instructions..." style={{marginBottom:8,fontSize:11}}/>
            <button onClick={generateAll} disabled={!comments.length}
              style={{background:'#1e1e2e',color:'#ccccee',border:'1px solid #2e2e3a',width:'100%'}}>
              ✨ Generate All
            </button>
          </div>

          <div style={{height:1,background:'#2e2e3a'}}/>

          {/* Post */}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <button onClick={()=>setComments(cs=>cs.map(c=>c.status==='pending'&&c.reply?{...c,status:'approved'}:c))}
              style={{background:'#1e1e2e',color:'#ccccee',border:'1px solid #2e2e3a',width:'100%'}}>
              ✓ Approve All
            </button>
            <button onClick={postApproved} disabled={approved===0}
              style={{background:'#0d2a1a',color:'#3dd68c',border:'1px solid #1a4a2a',width:'100%',fontWeight:700}}>
              🚀 Post Approved ({approved})
            </button>
            <button onClick={()=>setComments(cs=>cs.map(c=>c.status==='pending'?{...c,status:'skipped'}:c))}
              style={{background:'#1a0d0d',color:'#e85d4a',border:'1px solid #3a1a1a',width:'100%'}}>
              ⏭ Skip Remaining
            </button>
          </div>

          <div style={{height:1,background:'#2e2e3a'}}/>

          {/* Log */}
          <div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1.5,color:'#555568',marginBottom:6}}>Log</div>
            <div style={{background:'#0c0c14',border:'1px solid #2e2e3a',borderRadius:6,padding:'8px',fontSize:10,maxHeight:120,overflowY:'auto',lineHeight:1.8,color:'#888899'}}>
              {log.length===0 ? 'Ready.' : log.map((l,i)=><div key={i}>{l}</div>)}
            </div>
          </div>
        </div>

        {/* ── MAIN PANEL ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* Progress bar */}
          <div style={{background:'#111118',borderBottom:'1px solid #2e2e3a',padding:'8px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{flex:1,height:3,background:'#2e2e3a',borderRadius:2}}>
              <div style={{height:'100%',background:'#f0b429',borderRadius:2,width:pct+'%',transition:'width .4s'}}/>
            </div>
            <span style={{fontSize:10,color:'#555568',whiteSpace:'nowrap'}}>{done} / {comments.length}</span>
          </div>

          {/* Comments */}
          <div style={{flex:1,overflowY:'auto',padding:14,display:'flex',flexDirection:'column',gap:8}}>
            {filtered.length===0 ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:8,color:'#444455',textAlign:'center'}}>
                <div style={{fontSize:48}}>💬</div>
                <div style={{fontSize:16,color:'#666680'}}>{comments.length===0 ? 'No comments loaded' : 'No comments in this filter'}</div>
                <div style={{fontSize:11,color:'#444455'}}>
                  {comments.length===0 ? 'Connect YouTube and click Fetch.' : 'Select a different filter.'}
                </div>
              </div>
            ) : filtered.map(c => (
              <CommentCard
                key={c.id}
                c={c}
                onGenerate={() => generateOne(c.id, c)}
                onApprove={(text) => updateComment(c.id, {status:'approved', reply:text||c.reply})}
                onPost={() => postOne(c)}
                onSkip={() => updateComment(c.id, {status:'skipped'})}
                onChange={(reply) => updateComment(c.id, {reply})}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentCard({c,onGenerate,onApprove,onPost,onSkip,onChange}: {
  c: Comment;
  onGenerate: ()=>void;
  onApprove: (t:string)=>void;
  onPost: ()=>void;
  onSkip: ()=>void;
  onChange: (t:string)=>void;
}) {
  const typeColor = TYPE_COLORS[c.type];
  const statusColor = STATUS_COLOR[c.status];
  const isPosted = c.status === 'posted';
  const isSkipped = c.status === 'skipped';
  const isApproved = c.status === 'approved';
  const isGenerating = c.status === 'generating';

  return (
    <div style={{
      border: isPosted ? '1px solid #1a4a2a' : isApproved ? '1px solid #2a4a2a' : '1px solid #2e2e3a',
      borderRadius: 8,
      overflow: 'hidden',
      opacity: isSkipped ? 0.4 : 1,
      background: '#111118',
    }}>

      {/* Type + meta row */}
      <div style={{
        padding: '5px 12px',
        background: '#0d0d16',
        borderBottom: '1px solid #2e2e3a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{fontSize:10,fontWeight:700,color:typeColor,letterSpacing:.5}}>
          {TYPE_ICONS[c.type]} {c.typeLabel.toUpperCase()}
        </span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:9,color:'#555568'}}>{timeAgo(c.publishedAt)}</span>
          <span style={{
            fontSize:9,padding:'2px 7px',borderRadius:10,fontWeight:600,
            background:statusColor+'20',color:statusColor,
            animation:isGenerating?'pulse 1.4s infinite':undefined,
          }}>
            {STATUS_LABEL[c.status]}
          </span>
        </div>
      </div>

      {/* Parent context */}
      {c.type==='reply' && c.parentText && (
        <div style={{padding:'6px 12px',background:'#0a0e14',borderBottom:'1px solid #1e2e3a',fontSize:11,lineHeight:1.5}}>
          <span style={{color:'#38bdf8',fontWeight:600}}>↩ {c.parentAuthor}: </span>
          <span style={{color:'#555580'}}>"{c.parentText}"</span>
        </div>
      )}

      {/* Comment */}
      <div style={{padding:'12px',display:'flex',gap:10}}>
        {/* Avatar */}
        <div style={{
          width:34,height:34,borderRadius:'50%',flexShrink:0,
          background: typeColor+'22',
          border:`1px solid ${typeColor}44`,
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:15,fontWeight:700,color:typeColor,fontFamily:'serif',
        }}>
          {(c.firstName||c.author||'?').charAt(0).toUpperCase()}
        </div>
        {/* Content */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,color:'#ffffff',marginBottom:2}}>
            {c.author}
          </div>
          {c.videoTitle && c.type !== 'community_post' && (
            <div style={{fontSize:10,color:'#555568',marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              📹 {c.videoTitle}
            </div>
          )}
          <div style={{fontSize:13,color:'#ccccdd',lineHeight:1.6,wordBreak:'break-word'}}>
            {c.text}
          </div>
          {c.likes>0 && (
            <div style={{fontSize:10,color:'#555568',marginTop:4}}>👍 {c.likes}</div>
          )}
        </div>
      </div>

      {/* Reply zone */}
      {!isSkipped && !isPosted && (
        <div style={{padding:'10px 12px',background:'#0c0c14',borderTop:'1px solid #1e1e2e'}}>
          <textarea
            value={c.reply}
            onChange={e => onChange(e.target.value)}
            placeholder="Write or generate a reply..."
            rows={2}
            style={{
              width:'100%',
              background:'#16161e',
              color:'#e8e8f8',
              border:'1px solid #2e2e3a',
              borderRadius:6,
              padding:'8px 10px',
              fontSize:12.5,
              fontFamily:'DM Mono,monospace',
              lineHeight:1.5,
              resize:'vertical',
              display:'block',
              marginBottom:8,
              boxSizing:'border-box',
            }}
          />
          <div style={{display:'flex',gap:6}}>
            <button onClick={onGenerate}
              style={{flex:1,background:'#1a1a28',color:'#9999bb',border:'1px solid #2e2e3a',padding:'7px',fontSize:11}}>
              ✨ Gen
            </button>
            {isApproved
              ? <button onClick={onPost}
                  style={{flex:2,background:'#0d2a1a',color:'#3dd68c',border:'1px solid #1a4a2a',padding:'7px',fontSize:11,fontWeight:700}}>
                  🚀 Post Reply
                </button>
              : <button onClick={()=>onApprove(c.reply)}
                  style={{flex:2,background:'#111e18',color:'#3dd68c',border:'1px solid #1a3a20',padding:'7px',fontSize:11}}>
                  ✓ Approve
                </button>
            }
            <button onClick={onSkip}
              style={{flex:1,background:'#180e0e',color:'#e85d4a',border:'1px solid #2e1a1a',padding:'7px',fontSize:11}}>
              ✗ Skip
            </button>
          </div>
        </div>
      )}

      {isPosted && (
        <div style={{padding:'8px 12px',background:'#091410',borderTop:'1px solid #1a3a20',fontSize:11,color:'#3dd68c'}}>
          ✓ {c.reply}
        </div>
      )}

      {isSkipped && (
        <div style={{padding:'6px 12px',background:'#0e0e14',borderTop:'1px solid #2e2e3a',fontSize:10,color:'#444455'}}>
          skipped
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60)+'m ago';
  if (s < 86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
