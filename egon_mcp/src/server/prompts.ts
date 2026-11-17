import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** Prompt templates that walk an agent through common Domain Storytelling tasks. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'model_domain_story',
    {
      title: 'Model a domain story',
      description: 'Turns a description of a business process into an Egon domain story.',
      argsSchema: {
        process: z.string().describe('What happens, in the words of the domain expert.'),
        granularity: z.string().optional().describe('coarse-grained, medium-grained or fine-grained.'),
        pointInTime: z.string().optional().describe('as-is or to-be.'),
      },
    },
    ({ process, granularity, pointInTime }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Model this process as a domain story in Egon:

${process}

Steps:
1. Pick one concrete case (the happy path) and list who does what, in order, as sentences of the form "actor - verb - work object - (preposition) recipient". Use the domain's own words.
2. Choose icons: Person, Group or System for actors; call search_icons for work objects that are not documents.
3. Call build_story with the title, the sentences${granularity ? `, scope.granularity "${granularity}"` : ''}${pointInTime ? `, scope.pointInTime "${pointInTime}"` : ''}.
4. Call validate_story and fix every error and warning with update_element, add_activity or remove_element.
5. Read narrate_story back and compare it with the description above. Note variations and open questions with add_annotation instead of adding branches.
6. Call save_story, then open_in_egon so the user can look at it.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'review_domain_story',
    {
      title: 'Review a domain story',
      description: 'Checks an open story against Domain Storytelling good practice.',
      argsSchema: { storyId: z.string().describe('Id of an open story.') },
    },
    ({ storyId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Review the domain story "${storyId}".

1. Call get_story and validate_story.
2. Check that every step reads as a full sentence (narrate_story), that the same thing has the same name everywhere, that verbs are in the present tense, and that no step mixes two cases.
3. Check that systems appear as actors only if the scope is digitalized, and that the story stays below about 20 steps.
4. List concrete fixes, most important first, and ask before applying them.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'domain_story_interview',
    {
      title: 'Interview for a domain story',
      description: 'Runs a Domain Storytelling workshop as a conversation and models the story along the way.',
      argsSchema: { topic: z.string().describe('The process or situation to explore.') },
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Domain Storytelling moderator. Interview me about: ${topic}.

Ask one question at a time. Start with "Who starts the process, and what do they do first?" and keep asking "What happens next?" and "Who gets it?".
After each answer, add the step with add_sentence (create the story first with create_story) and read the step back to me in one sentence so I can correct it.
When I say we are done, run auto_layout and validate_story, show me narrate_story, then save_story and give me the open_in_egon link.`,
          },
        },
      ],
    }),
  );
}
