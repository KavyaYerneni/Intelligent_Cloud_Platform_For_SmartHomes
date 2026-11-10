// Integration scenario through the real UI (brief steps 1-9, except the 45 s
// offline wait, which docs/demo/integration-scenario.md covers manually).
// Needs the API and worker running against migrated, seeded databases.
import {test,expect} from '@playwright/test';
const PASSWORD=process.env.DEMO_PASSWORD;
const suffix=Date.now().toString(36);
const HOUSE=`E2E House ${suffix}`, SERIAL=`SN-E2E-${suffix}`;

async function signIn(page,email){
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Community overview'})).toBeVisible();
}

test('operator runs the full scenario through the UI',async({page})=>{
  await signIn(page,'operator@demo.local');

  // 1. Register a house, a room and a device
  await page.getByRole('link',{name:'Houses & devices'}).click();
  await page.getByRole('button',{name:'Add',exact:true}).click();
  const d=page.getByRole('dialog');
  await d.getByLabel('Name').fill(HOUSE);
  await d.getByLabel('Street address').fill('1 Synthetic Way, San Jose');
  await d.getByRole('button',{name:'Add house'}).click();
  await expect(page.getByRole('heading',{name:HOUSE})).toBeVisible();
  await page.getByRole('button',{name:'Add room'}).click();
  await d.getByLabel('Room name').fill('Living Room');
  await d.getByRole('button',{name:'Add room'}).click();
  await expect(page.getByText('Living Room added.')).toBeVisible();
  await page.getByRole('button',{name:'Register device'}).click();
  await d.getByLabel('Name').fill('E2E microphone');
  await d.getByLabel('Serial number').fill(SERIAL);
  await d.getByRole('button',{name:'Register device'}).click();
  const drawer=page.locator('.drawer');
  await expect(drawer.getByRole('heading',{name:'E2E microphone'})).toBeVisible();
  await expect(drawer.getByText('Waiting for first heartbeat').first()).toBeVisible();

  // Duplicate serial is refused with a link to the existing device
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Register device'}).click();
  await d.getByLabel('Name').fill('Duplicate');
  await d.getByLabel('Serial number').fill(SERIAL);
  await d.getByRole('button',{name:'Register device'}).click();
  await expect(d.getByText('Already registered to another device.')).toBeVisible();
  await expect(d.getByRole('button',{name:'an existing device'})).toBeVisible();
  await d.getByRole('button',{name:'Cancel'}).click();

  // 2. Simulator heartbeat brings the device online
  await page.getByRole('link',{name:'Simulator'}).click();
  await page.getByRole('button',{name:'Send one heartbeat'}).click();
  await expect(page.locator('.log').getByText('Device is online.',{exact:false}).first()).toBeVisible();

  // 3. Overview shows the house with its device online
  await page.getByRole('link',{name:'Overview'}).click();
  const row=page.getByRole('row').filter({hasText:HOUSE});
  await expect(row.getByText('1 of 1')).toBeVisible();

  // 4-6. Smoke alarm event, idempotent replay, live alert badge
  await page.getByRole('link',{name:'Simulator'}).click();
  await page.locator('.type-card',{hasText:'Smoke alarm'}).click();
  await expect(page.getByText('Always creates a critical alert (safety rule).')).toBeVisible();
  await page.getByRole('button',{name:'Send event'}).click();
  await expect(page.locator('.log').getByText('Accepted as',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Replay last event'}).click();
  await expect(page.locator('.log').getByText('No second record or alert.',{exact:false})).toBeVisible();
  await expect(page.locator('.nav-count')).toBeVisible({timeout:15000}); // pushed over the WebSocket, no reload

  // 7. Acknowledge, investigate, resolve
  await page.getByRole('link',{name:/^Alerts/}).click();
  await page.locator('.q-item',{hasText:HOUSE}).first().click();
  const detail=page.locator('.alert-detail');
  await expect(detail.getByRole('heading',{name:`Smoke alarm at ${HOUSE}`})).toBeVisible();
  await expect(detail.getByText('1 event grouped')).toBeVisible();
  await detail.getByRole('button',{name:'Acknowledge'}).click();
  await expect(detail.locator('.stepper li.now')).toHaveText(/Acknowledged/);
  await detail.getByLabel('Note').fill('Checked the kitchen camera feed; cooking smoke.');
  await detail.getByRole('button',{name:'Start investigation'}).click();
  await expect(detail.locator('.stepper li.now')).toHaveText(/Investigating/);
  await detail.getByRole('button',{name:'Resolve'}).click();
  await expect(d.getByRole('button',{name:'Resolve alert'})).toBeDisabled(); // critical needs an outcome
  await d.getByLabel('Outcome (required)').fill('Confirmed with resident. No fire; ventilation turned on.');
  await d.getByRole('button',{name:'Resolve alert'}).click();
  await expect(detail.locator('.stepper li.now')).toHaveText(/Resolved/);
  await expect(detail.getByText('Investigating to Resolved')).toBeVisible();

  // 8. Event data and audit history
  await detail.getByRole('button',{name:'Stored record'}).click();
  await expect(drawer.getByText('Both stores agree')).toBeVisible({timeout:15000});
  await expect(drawer.getByText('Simulated or rule based. No trained model is used.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Audit log'}).click();
  await expect(page.getByRole('cell',{name:'Alert transition'}).first()).toBeVisible();
});

test('owner sees only their house and no management controls',async({page})=>{
  await signIn(page,'owner@demo.local');
  const picker=page.getByRole('combobox',{name:'House',exact:true});
  await expect(picker.locator('option',{hasText:'Willow House'})).toHaveCount(1); // waits for the list
  await expect(picker.locator('option',{hasText:'Oak House'})).toHaveCount(0);
  await expect(picker.locator('option',{hasText:'E2E House'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Simulator'})).toHaveCount(0);
  await page.getByRole('link',{name:'Houses & devices'}).click();
  await expect(page.getByRole('heading',{name:'All devices'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Register device'})).toHaveCount(0);
  await page.goto('/#inventory/D002'); // Oak House device: outside the owner's scope
  await expect(page.locator('.drawer').getByText("You don't have access to this.")).toBeVisible();
});
