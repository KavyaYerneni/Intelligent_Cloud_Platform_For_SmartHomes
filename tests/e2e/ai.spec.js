// AI component through the real UI: model card, test console, a live clip from
// the simulator becoming a stored model event, disabling inference, and roles.
// Needs the app, worker and inference service (ml/) running. Labels depend on the
// model and audio, so assertions check the flow, not which class was predicted.
import {test,expect} from '@playwright/test';
const PASSWORD=process.env.DEMO_PASSWORD;

function wav(seconds=2,rate=16000,freq=440){
 const n=seconds*rate,buf=Buffer.alloc(44+n*2);
 buf.write('RIFF',0);buf.writeUInt32LE(36+n*2,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);
 buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write('data',36);buf.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)buf.writeInt16LE(Math.round(Math.sin(2*Math.PI*freq*i/rate)*12000),44+i*2);
 return {name:`tone-${freq}.wav`,mimeType:'audio/wav',buffer:buf};
}
async function signIn(page,email){
 await page.goto('/');
 await page.getByLabel('Email').fill(email);
 await page.getByLabel('Password').fill(PASSWORD);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Community overview'})).toBeVisible();
}

test('operator manages the model and sends a live clip through it',async({page})=>{
 await signIn(page,'operator@demo.local');
 await page.getByRole('link',{name:'AI models'}).click();
 await expect(page.getByRole('heading',{name:'AI models'})).toBeVisible();

 await page.getByRole('tab',{name:'Model card'}).click();
 await expect(page.getByRole('heading',{name:'Human sound classifier'})).toBeVisible();
 await expect(page.getByText('Checksum verified')).toBeVisible();
 await expect(page.getByText(/Treat these numbers as an upper bound/)).toBeVisible();

 await page.getByRole('tab',{name:'Try the model'}).click();
 await page.locator('.dropzone input[type=file]').setInputFiles(wav(2,16000,300));
 await page.getByRole('button',{name:'Classify clip'}).click();
 await expect(page.getByText(/% confident/)).toBeVisible({timeout:60000}); // first YAMNet call can be slow
 await expect(page.locator('.label-bars li')).toHaveCount(10);

 // Live clip from the simulator: becomes a stored event with source "AI model".
 await page.getByRole('combobox',{name:'House',exact:true}).selectOption({label:'Willow House'});
 await page.getByRole('link',{name:'Simulator'}).click();
 await page.getByRole('button',{name:'Send one heartbeat'}).click();
 await page.locator('.audio-send input[type=file]').setInputFiles(wav(3,44100,520));
 await page.getByRole('button',{name:'Send clip to the model'}).click();
 const line=page.locator('.log li').filter({hasText:'AI: tone-520.wav'});
 await expect(line).toContainText('Model heard',{timeout:60000});

 await page.getByRole('link',{name:'Data operations'}).click();
 // History is newest first, so the first data row is the clip just sent.
 const row=page.locator('tbody tr').first();
 await expect(row).toContainText('AI model');
 await row.getByRole('link').click();
 const drawer=page.locator('.drawer');
 await expect(drawer.getByText('Model heard')).toBeVisible({timeout:15000});
 await expect(drawer.getByText(/Trained model human-sounds 1\.0\.0/)).toBeVisible();
 await page.keyboard.press('Escape');

 // Disable inference: live clips are refused; re-enable afterwards.
 await page.getByRole('link',{name:'AI models'}).click();
 await page.getByRole('tab',{name:'Model card'}).click();
 try{
  await page.getByRole('button',{name:'Disable audio inference'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Disable'}).click();
  await expect(page.getByText('Audio inference disabled.')).toBeVisible();
  await page.getByRole('link',{name:'Simulator'}).click();
  await page.locator('.audio-send input[type=file]').setInputFiles(wav(2,16000,700));
  await page.getByRole('button',{name:'Send clip to the model'}).click();
  await expect(page.locator('.log li').filter({hasText:'AI: tone-700.wav'})).toContainText('disabled');
 }finally{
  await page.getByRole('link',{name:'AI models'}).click();
  await page.getByRole('tab',{name:'Model card'}).click();
  const enable=page.getByRole('button',{name:'Enable audio inference'});
  if(await enable.count()){await enable.click();await page.getByRole('dialog').getByRole('button',{name:'Enable'}).click();}
  await expect(page.getByRole('button',{name:'Disable audio inference'})).toBeVisible();
 }
});

test('technician sees the model but cannot change it; owner has no AI page',async({page})=>{
 await signIn(page,'technician@demo.local');
 await page.getByRole('link',{name:'AI models'}).click();
 await page.getByRole('tab',{name:'Model card'}).click();
 await expect(page.getByText('Only a cloud operator can enable or disable the model.')).toBeVisible();
 await expect(page.getByRole('button',{name:/audio inference/})).toHaveCount(0);
 await page.getByRole('button',{name:'Sign out'}).click();
 await signIn(page,'owner@demo.local');
 await expect(page.getByRole('link',{name:'AI models'})).toHaveCount(0);
});
