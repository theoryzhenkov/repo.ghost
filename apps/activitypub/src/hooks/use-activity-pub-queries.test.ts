import React from 'react';
import {ActivityPubAPI, isApiError} from '../api/activitypub';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useReplyChainForUser, useUpdateNoteMutationForUser} from './use-activity-pub-queries';

globalThis.fetch = vi.fn().mockResolvedValue({
    json: vi.fn().mockResolvedValue({
        site: {url: 'https://test.com'}
    })
});

vi.mock('../api/activitypub', () => ({
    ActivityPubAPI: vi.fn(),
    isApiError: vi.fn(),
    PostType: {
        Note: 0,
        Article: 1,
        Tombstone: 2
    }
}));

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false
            }
        }
    });

    return {
        queryClient,
        wrapper({children}: {children: React.ReactNode}) {
            return React.createElement(QueryClientProvider, {client: queryClient}, children);
        }
    };
};

describe('useReplyChainForUser', () => {
    let mockApi: {
        getReplies: ReturnType<typeof vi.fn>;
        getPost: ReturnType<typeof vi.fn>;
        updateNote: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            json: vi.fn().mockResolvedValue({
                site: {url: 'https://test.com'}
            })
        });

        mockApi = {
            getReplies: vi.fn(),
            getPost: vi.fn(),
            updateNote: vi.fn()
        };

        (ActivityPubAPI as ReturnType<typeof vi.fn>).mockImplementation(function () {
            return mockApi;
        });
        (isApiError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it('should retry with getPost when getReplies returns 404', async () => {
        const mockReplyChain = {
            ancestors: {chain: [], hasMore: false},
            focus: {id: 'post-1', content: 'Test'},
            descendants: {chain: [], hasMore: false},
            next: null
        };

        const apiError = {message: 'Not found', statusCode: 404};

        mockApi.getReplies
            .mockRejectedValueOnce(apiError)
            .mockResolvedValueOnce(mockReplyChain);
        mockApi.getPost.mockResolvedValue({id: 'post-1'});

        const {wrapper} = createWrapper();
        const {result} = renderHook(
            () => useReplyChainForUser('test-handle', 'post-1'),
            {wrapper}
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        await waitFor(() => {
            expect(result.current.data).toEqual(mockReplyChain);
        });

        expect(mockApi.getReplies).toHaveBeenCalledTimes(2);
        expect(mockApi.getPost).toHaveBeenCalledTimes(1);
        expect(mockApi.getPost).toHaveBeenCalledWith('post-1');
    });
});

describe('useUpdateNoteMutationForUser', () => {
    let mockApi: {
        getReplies: ReturnType<typeof vi.fn>;
        getPost: ReturnType<typeof vi.fn>;
        updateNote: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            json: vi.fn().mockResolvedValue({
                site: {url: 'https://test.com'}
            })
        });

        mockApi = {
            getReplies: vi.fn(),
            getPost: vi.fn(),
            updateNote: vi.fn()
        };

        (ActivityPubAPI as ReturnType<typeof vi.fn>).mockImplementation(function () {
            return mockApi;
        });
    });

    it('updates cached note content after the API call succeeds', async () => {
        const oldPost = {
            id: 'post-1',
            type: 0,
            title: '',
            excerpt: 'Old content',
            summary: null,
            content: 'Old content',
            url: 'https://example.com/post-1',
            featureImageUrl: null,
            publishedAt: '2026-06-18T00:00:00.000Z',
            likeCount: 0,
            likedByMe: false,
            replyCount: 0,
            readingTimeMinutes: 1,
            attachments: [],
            author: {
                id: 'author-1',
                handle: '@theoryzhenkov@example.com',
                avatarUrl: 'https://example.com/avatar.png',
                name: 'Theo',
                url: 'https://example.com/@theoryzhenkov',
                followedByMe: false
            },
            authoredByMe: true,
            repostCount: 0,
            repostedByMe: false,
            repostedBy: null
        };
        const updatedPost = {
            ...oldPost,
            excerpt: 'Updated content',
            content: 'Updated content'
        };
        const existingActivity = {
            id: oldPost.id,
            type: 'Create',
            actor: {},
            object: {
                id: oldPost.id,
                type: 'Note',
                content: oldPost.content,
                authored: true
            }
        };
        const {queryClient, wrapper} = createWrapper();
        queryClient.setQueryData(['feed'], {
            pages: [{posts: [existingActivity]}]
        });
        queryClient.setQueryData(['reply_chain', oldPost.id], {
            ancestors: {chain: [oldPost], hasMore: false},
            post: oldPost,
            children: [{post: oldPost, chain: [oldPost], hasMore: false}],
            next: null
        });
        mockApi.updateNote.mockResolvedValue(updatedPost);

        const {result} = renderHook(
            () => useUpdateNoteMutationForUser('index'),
            {wrapper}
        );

        await act(async () => {
            await result.current.mutateAsync({id: oldPost.id, content: updatedPost.content});
        });

        expect(mockApi.updateNote).toHaveBeenCalledWith(oldPost.id, updatedPost.content);
        expect(queryClient.getQueryData<{pages: {posts: typeof existingActivity[]}[]}>(['feed'])?.pages[0].posts[0].object.content).toBe(updatedPost.content);
        expect(queryClient.getQueryData<{post: typeof oldPost}>(['reply_chain', oldPost.id])?.post.content).toBe(updatedPost.content);
    });
});
