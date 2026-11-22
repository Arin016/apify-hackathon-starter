import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePosts,rankPosts,validateIdeas,creatorReport} from '../src/creator.js';
const end=Date.parse('2026-11-22T06:00:00Z');
const start=end-7*86400000;
const row={url:'https://www.instagram.com/reel/example/',timestamp:new Date(end-86400000).toISOString(),caption:'Indian street food',likesCount:100,commentsCount:10};
test('creator gate rejects errors, stale/future/undated posts and unknown metrics; deduplicates URLs',()=>{
 const rows=[row,row,{...row,url:'https://www.instagram.com/reel/old/',timestamp:new Date(start-1).toISOString()},{...row,timestamp:'unknown'},{...row,timestamp:new Date(end+1).toISOString()},{...row,likesCount:-1},{...row,commentsCount:undefined},{...row,error:'no data'},{...row,url:'https://evil.example/'}];
 assert.equal(normalizePosts('Instagram',rows,start,end).length,1);
 const [p]=normalizePosts('Instagram',[row],start,end);assert.equal(p!.views,null);
});
test('ranking compares within platforms and does not reward another platforms scale',()=>{
 const p=normalizePosts('Instagram',[row,{...row,url:'https://www.instagram.com/reel/low/',likesCount:1}],start,end);
 const y={...p[0]!,id:'yt',url:'https://www.youtube.com/shorts/test',platform:'YouTube' as const,likes:9999999};
 const r=rankPosts([...p,y],end);assert.equal(r.find(x=>x.id==='yt')!.score,50);assert.equal(r.find(x=>x.url===row.url)!.score,100);
});
test('idea references must exist and cover distinct posts and both sources',()=>{
 const posts=normalizePosts('Instagram',[row],start,end);
 const ideas={ideas:Array.from({length:5},(_,i)=>({title:'Idea '+i,hook:'Hook',angle:'Angle',evidenceIds:['fake']}))};
 assert.throws(()=>validateIdeas(ideas,posts),/EVIDENCE_GATE/);
 ideas.ideas.forEach(i=>i.evidenceIds=[posts[0]!.id]);assert.throws(()=>validateIdeas(ideas,posts),/COVERAGE_GATE/);
});
test('creator report escapes model and source markup',()=>{
 const html=creatorReport({spec:{niche:'<script>bad()</script>'},status:'INSUFFICIENT_EVIDENCE',posts:[],children:{}});
 assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.equal(html.includes('<script>bad()</script>'),false);
});
test('editorial gate rejects observed unsupported growth and nutrition promises',()=>{
 const posts=normalizePosts('Instagram',[row],start,end);
 const ideas={ideas:[{title:'Viral high-protein breakfast',hook:'Ready in 5 minutes',angle:'Weight loss promise',evidenceIds:[posts[0]!.id]}]};
 assert.throws(()=>validateIdeas(ideas,posts),/IDEA_COPY_GATE/);
});
