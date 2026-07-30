import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import type { Address } from 'viem';

export type Tally = { up: number; down: number; mine: 0 | 1 | -1 };

/** The exact text the wallet signs. The server rebuilds it byte for byte, so
 *  the two must never drift apart. */
export function voteMessage(token: string, vote: 1 | -1) {
  return `Vladhood launchpad\nVote: ${vote === 1 ? 'like' : 'dislike'}\nToken: ${token.toLowerCase()}`;
}

async function readTally(token: string, voter?: string): Promise<Tally> {
  const url = `/votes/?token=${token}${voter ? `&voter=${voter}` : ''}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Could not read the votes (HTTP ${res.status}).`);
  return { up: body.up, down: body.down, mine: body.mine };
}

export function useVotes(token?: Address) {
  const { address } = useAccount();
  return useQuery({
    queryKey: ['votes', token, address],
    enabled: Boolean(token),
    retry: false,
    queryFn: () => readTally(token!, address),
  });
}

/**
 * Casting a vote asks the wallet to sign. The address is never sent as a claim
 * the server takes on trust — it recovers the signer itself and only files the
 * vote if the two agree.
 */
export function useCastVote(token?: Address) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vote: 1 | -1): Promise<Tally> => {
      if (!token || !address) throw new Error('Connect a wallet to vote.');
      const signature = await signMessageAsync({ message: voteMessage(token, vote) });
      const res = await fetch('/votes/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token.toLowerCase(), voter: address, vote, signature }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? `The vote did not go through (HTTP ${res.status}).`);
      return { up: body.up, down: body.down, mine: body.mine };
    },
    onSuccess: (tally) => queryClient.setQueryData(['votes', token, address], tally),
  });
}
