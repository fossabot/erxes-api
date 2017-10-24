/* eslint-env jest */
/* eslint-disable no-underscore-dangle */

import moment from 'moment';
import { connect, disconnect } from '../db/connection';
import {
  Conversations,
  ConversationMessages,
  Brands,
  Users,
  Customers,
  Integrations,
} from '../db/models';
import {
  conversationFactory,
  userFactory,
  customerFactory,
  brandFactory,
  conversationMessageFactory,
  integrationFactory,
} from '../db/factories';
import { sendMessageEmail } from '../cronJobs/conversations';
import utils from '../data/utils';

beforeAll(() => connect());

afterAll(() => disconnect());

describe('Cronjob conversation send email', () => {
  let _conversation;
  let _conversationMessage;
  let _customer;
  let _brand;
  let _user;

  beforeEach(async () => {
    // Creating test data

    _customer = await customerFactory();
    _brand = await brandFactory();
    _user = await userFactory();
    const _integration = await integrationFactory({ brandId: _brand._id });

    _conversation = await conversationFactory({
      customerId: _customer._id,
      assignedUserId: _user._id,
      brandId: _brand._id,
      integrationId: _integration._id,
    });

    _conversationMessage = await conversationMessageFactory({
      conversationId: _conversation._id,
      userId: _user._id,
    });
  });

  afterEach(async () => {
    // Clearing test data
    await Conversations.remove({});
    await Users.remove({});
    await Customers.remove({});
    await Brands.remove({});
    await Integrations.remove({});
    await ConversationMessages.remove({});
  });

  test('Conversations utils', async () => {
    const spyEmail = jest.spyOn(utils, 'sendEmail');

    Conversations.newOrOpenConversation = jest.fn(() => [_conversation]);
    ConversationMessages.getNonAsnweredMessage = jest.fn(() => _conversationMessage);
    ConversationMessages.getAdminMessages = jest.fn(() => [_conversationMessage]);
    ConversationMessages.markSentAsReadMessages = jest.fn();

    await sendMessageEmail();

    expect(Conversations.newOrOpenConversation.mock.calls.length).toBe(1);

    expect(ConversationMessages.getNonAsnweredMessage.mock.calls.length).toBe(1);
    expect(ConversationMessages.getNonAsnweredMessage).toBeCalledWith(_conversation._id);

    expect(ConversationMessages.getAdminMessages.mock.calls.length).toBe(1);
    expect(ConversationMessages.getAdminMessages).toBeCalledWith(_conversation.id);

    expect(ConversationMessages.getAdminMessages.mock.calls.length).toBe(1);
    expect(ConversationMessages.getAdminMessages).toBeCalledWith(_conversation.id);

    expect(spyEmail.mock.calls.length).toBe(1);

    const question = _conversationMessage;
    question.createdAt = moment(question.createdAt).format('DD MMM YY, HH:mm');

    const data = {
      customer: _customer,
      question,
      brand: _brand,
    };

    const answer = _conversationMessage;

    answer.user = _user;
    answer.createdAt = moment(_conversationMessage.createdAt).format('DD MMM YY, HH:mm');
    data.answers = [answer];

    // send email: check called parameters ================
    const expectedArgs = {
      to: _customer.email,
      title: `Reply from "${_brand.name}"`,
      template: {
        name: 'conversationCron',
        isCustom: true,
        data,
      },
    };

    const calledArgs = spyEmail.mock.calls[0][0];

    expect(expectedArgs.to).toBe(calledArgs.to);
    expect(expectedArgs.title).toBe(calledArgs.title);
    expect(expectedArgs.template.name).toBe(calledArgs.template.name);
    expect(expectedArgs.template.isCustom).toBe(calledArgs.template.isCustom);

    expect(expectedArgs.template.data.question.toJSON()).toEqual(
      calledArgs.template.data.question.toJSON(),
    );

    expect(expectedArgs.template.data.brand.toJSON()).toEqual(
      calledArgs.template.data.brand.toJSON(),
    );
    expect(expectedArgs.template.data.customer.toJSON()).toEqual(
      calledArgs.template.data.customer.toJSON(),
    );

    // mark as read: check called parameters ===============
    expect(ConversationMessages.markSentAsReadMessages.mock.calls.length).toBe(1);
    expect(ConversationMessages.markSentAsReadMessages).toBeCalledWith(_conversation.id);
  });

  test('Conversations utils without customer', async () => {
    _conversation.customerId = null;
    await _conversation.save();

    await sendMessageEmail();
  });
});
