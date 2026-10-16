import {test}from'node:test';import assert from'node:assert/strict';import React from'react';import{create,act}from'react-test-renderer';import PostPreview from'../src/components/PostPreview';
test('background refresh cannot replace the revision of the open edit',async()=>{
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,document:{activeElement:null,body:{style:{}},addEventListener(){},removeEventListener(){}}});let body:any;
globalThis.fetch=async(_u,options)=>{body=JSON.parse(String(options?.body));return new Response(JSON.stringify({updated_at:'2099-01-01T00:03:00Z'}),{status:200})};
const p:any={id:'id',approval_code:1,hook:'Test',format:'single',status:'approved',scheduled_for:'2099-01-01T02:00:00Z',updated_at:'2099-01-01T00:00:00Z',post_assets:[],hashtags:[]};let tree:any;
await act(async()=>{tree=create(<PostPreview post={p} onClose={()=>{}} onChanged={async()=>{}}/>)});
await act(async()=>{tree.update(<PostPreview post={{...p,scheduled_for:'2099-01-02T02:00:00Z',updated_at:'2099-01-01T00:01:00Z'}} onClose={()=>{}} onChanged={async()=>{}}/>)});
await act(async()=>{await tree.root.findAllByType('button').find((b:any)=>b.children.includes('Save schedule')).props.onClick()});
assert.equal(body.expectedUpdatedAt,p.updated_at);await act(async()=>tree.unmount());
});
