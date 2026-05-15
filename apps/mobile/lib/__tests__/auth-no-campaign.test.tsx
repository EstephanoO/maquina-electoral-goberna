import { buildAppConfigForTest } from '../app-context';

test('buildAppConfig returns a valid config when user has zero campaigns', async () => {
  const user = { id: 'u1', full_name: '', email: 'x@goberna.pe', role: 'agente_campo', status: 'active' } as const;
  const config = await buildAppConfigForTest(user, []);
  expect(config).not.toBeNull();
  expect(config!.campaign).toBeNull();
  expect(config!.candidate.color_primario).toBe('#163960');
  expect(config!.agent.id).toBe('u1');
});
