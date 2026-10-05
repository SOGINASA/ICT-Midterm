const { chromium, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'http://localhost:3000';
const out = path.resolve('tmp/presentation/screens');
const records = [];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 let account;
 const errors=[];
 async function context(viewport={width:1440,height:1000}){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:1,locale:'en-US',colorScheme:'light'});
  const page=await ctx.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/') && ![origin,'http://127.0.0.1:8000'].includes(url.origin)) throw new Error('Non-local API blocked');
   await route.continue();
  });
  return {ctx,page};
 }
 async function shot(page,name,{fullPage=false}={}){
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled',fullPage});
  records.push({name:name+'.png',viewport:page.viewportSize(),fullPage});
 }
 async function demo(viewport){
  const state=await context(viewport);
  await state.page.goto(origin+'/demo');
  await expect(state.page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await expect(state.page.getByText('₸77,650',{exact:true}).first()).toBeVisible();
  return state;
 }
 try {
  const land=await context();
  await land.page.goto(origin);
  await expect(land.page.getByRole('link',{name:/Create account/}).first()).toBeVisible();
  await shot(land.page,'landing-desktop');
  await land.page.goto(origin+'/register');
  await expect(land.page.getByLabel('Your name',{exact:true})).toBeVisible();
  await shot(land.page,'register-desktop');
  await land.ctx.close();
  const desk=await demo();
  for(const [route,name,heading] of [['/app','overview-desktop','Overview'],['/app/transactions','transactions-desktop','Transactions'],['/app/budgets','budgets-desktop','Budgets'],['/app/insights','insights-desktop','Insights']]){
   await desk.page.goto(origin+route);
   await expect(desk.page.getByRole('heading',{name:heading,exact:true,level:1})).toBeVisible();
   await shot(desk.page,name);
  }
  await desk.ctx.close();
  const mob=await demo({width:390,height:844});
  await shot(mob.page,'overview-mobile');
  await mob.page.goto(origin+'/app/add');
  await expect(mob.page.getByRole('heading',{name:'Add expense',exact:true})).toBeVisible();
  await mob.page.getByRole('button',{name:'Save expense',exact:true}).click();
  await expect(mob.page.getByText('Enter an amount greater than ₸0.')).toBeVisible();
  await mob.page.evaluate(()=>window.scrollTo(0,0));
  await shot(mob.page,'validation-mobile');
  await mob.page.reload();
  await expect(mob.page.getByRole('heading',{name:'Add expense',exact:true})).toBeVisible();
  await mob.page.getByLabel('How much did you spend?').fill('3500');
  await mob.page.getByText('Food',{exact:true}).click();
  await mob.page.getByLabel('Note (optional)').fill('Campus lunch');
  await mob.page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
  await shot(mob.page,'add-expense-mobile');
  await shot(mob.page,'add-expense-mobile-full',{fullPage:true});
  await mob.page.getByRole('button',{name:'Save expense',exact:true}).click();
  await expect(mob.page.getByRole('dialog',{name:'Expense added',exact:true})).toBeVisible();
  await expect(mob.page.getByRole('dialog').getByText('₸38,850',{exact:true})).toBeVisible();
  await shot(mob.page,'success-mobile');
  await mob.page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(mob.page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await shot(mob.page,'updated-overview-mobile');
  await mob.ctx.close();
  const off=await demo({width:390,height:844});
  await off.page.getByRole('button',{name:'Local demo',exact:true}).click();
  await expect(off.page.getByText('Demo offline mode is on')).toBeVisible();
  await off.page.getByRole('link',{name:'Add expense',exact:true}).first().click();
  await off.page.getByLabel('How much did you spend?').fill('1200');
  await off.page.getByText('Transport',{exact:true}).click();
  await off.page.getByLabel('Note (optional)').fill('Bus to campus');
  await off.page.getByRole('button',{name:'Save expense',exact:true}).click();
  await expect(off.page.getByText('Saved on this device — pending demo sync when the connection returns.')).toBeVisible();
  await shot(off.page,'offline-success-mobile');
  await off.page.getByRole('button',{name:'Done',exact:true}).click();
  await off.page.getByRole('link',{name:'History',exact:true}).click();
  await expect(off.page.getByText('Pending sync',{exact:true})).toBeVisible();
  await shot(off.page,'offline-pending-mobile');
  await off.page.getByRole('button',{name:'Go online',exact:true}).click();
  await expect(off.page.getByText('Pending sync',{exact:true})).toHaveCount(0);
  await shot(off.page,'offline-recovered-mobile');
  await off.ctx.close();
  const auth=await context({width:1440,height:900});
  account={email:`tengeflow-e2e-${randomUUID()}@example.test`,password:`Local-${randomUUID()}!`};
  await auth.page.goto(origin+'/register');
  await auth.page.getByLabel('Your name',{exact:true}).fill('Ayan');
  await auth.page.getByLabel('Email address',{exact:true}).fill(account.email);
  await auth.page.getByLabel('Password',{exact:true}).fill(account.password);
  await auth.page.getByLabel('Confirm password',{exact:true}).fill(account.password);
  const registerPromise=auth.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register');
  await auth.page.getByRole('button',{name:'Create account',exact:true}).click();
  if(!(await registerPromise).ok()) throw new Error('Registration failed');
  await expect(auth.page.getByRole('heading',{name:'Check your inbox.'})).toBeVisible();
  let message;
  await expect.poll(async()=>{
   const response=await fetch('http://127.0.0.1:8000/api/dev/messages');
   const inbox=await response.json();
   message=inbox.messages.find(m=>m.to===account.email && /confirm/i.test(m.subject));
   return Boolean(message);
  },{timeout:15000}).toBe(true);
  const links=[...message.html.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&'));
  const link=links.find(candidate=>{const u=new URL(candidate);return u.origin===origin&&u.pathname==='/auth/callback'&&u.searchParams.has('code');});
  if(!link)throw new Error('Expected local verification link missing');
  await auth.page.goto(link);
  await expect(auth.page).toHaveURL(/\/onboarding$/);
  await expect(auth.page.getByLabel('What should we call you?')).toHaveValue('Ayan');
  await shot(auth.page,'onboarding-name-desktop');
  await auth.page.getByRole('button',{name:'Continue',exact:true}).click();
  await auth.page.getByLabel('Your monthly budget').fill('120000');
  await auth.page.evaluate(()=>document.activeElement.blur());
  await shot(auth.page,'onboarding-budget-desktop');
  await auth.page.setViewportSize({width:390,height:844});
  await shot(auth.page,'onboarding-budget-mobile');
  await auth.page.getByRole('button',{name:'Continue',exact:true}).click();
  await auth.page.getByRole('button',{name:'Use suggested limits',exact:true}).click();
  await shot(auth.page,'onboarding-limits-mobile');
  await auth.page.setViewportSize({width:1440,height:900});
  await shot(auth.page,'onboarding-limits-desktop');
  await auth.ctx.close();
 } finally {
  await browser.close();
  if(account) execFileSync('backend/.venv/bin/python',['scripts/cleanup-e2e.py',account.email],{stdio:['ignore','pipe','pipe']});
  fs.writeFileSync(path.join(out,'capture-record.json'),JSON.stringify({screenshots:records,errors},null,2));
 }
 console.log(JSON.stringify({files:records.map(r=>r.name),runtimeErrors:errors},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
