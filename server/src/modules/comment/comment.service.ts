import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SMTPService } from '../smtp/smtp.service';
import { ArticleService } from '../article/article.service';
import { SettingService } from '../setting/setting.service';
import { UserService } from '../user/user.service';
import { marked } from '../article/markdown.util';
import { Comment } from './comment.entity';

/**
 * 扁平接口评论转为树形评论
 * @param list
 */
function buildTree(list) {
  let temp = {};
  let tree = [];

  for (let item of list) {
    temp[item.id] = item;
  }

  for (let i in temp) {
    if (temp[i].parentCommentId) {
      if (temp[temp[i].parentCommentId]) {
        if (!temp[temp[i].parentCommentId].children) {
          temp[temp[i].parentCommentId].children = [];
        }
        temp[temp[i].parentCommentId].children.push(temp[i]);
      } else {
        tree.push(temp[i]); // 父级可能被删除或者未通过，直接升级
      }
    } else {
      tree.push(temp[i]);
    }
  }

  return tree;
}

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly articleService: ArticleService,
    private readonly smtpService: SMTPService,
    private readonly settingService: SettingService,
    private readonly userService: UserService
  ) {}

  /**
   * 创建评论
   * @param comment
   */
  async create(
    comment: Partial<Comment> & { reply?: string }
  ): Promise<Comment> {
    const { articleId, name, email, content, reply } = comment;

    if (!articleId || !name || !email || !content) {
      throw new HttpException('缺失参数', HttpStatus.BAD_REQUEST);
    }

    const { html } = marked(content);
    comment.html = html;
    comment.pass = false;
    const newComment = await this.commentRepository.create(comment);
    await this.commentRepository.save(newComment);

    // 发送通知邮件
    const { smtpFromUser: from, systemUrl } = await this.settingService.findAll(
      null,
      true
    );

    let to = null;

    if (reply) {
      // 回复邮件
      to = reply;
    } else {
      const user = await this.userService.findAll();
      if (user && user[0] && user[0].mail) {
        to = user[0].mail;
      } else {
        to = from;
      }
    }

    const emailMessage = {
      from,
      to,
      ...(reply
        ? {
            subject: '评论回复通知',
            html: `
        <div>
          <p>您的评论已被回复。</p>
          <p>前往以下链接查看：</p>
          <div>
          ${systemUrl + '/article/' + articleId}
          <br />
          ${systemUrl + '/page/' + articleId}
          </div>
        </div>
      `,
          }
        : {
            subject: '新评论通知',
            html: `
        <div>
          <p>评论人：${comment.name}</p>
          <p>评论内容：${comment.content}</p>
          <a href="${systemUrl}/admin/comment" target="_blank">前往审核</a>
        </div>
      `,
          }),
    };

    this.smtpService.create(emailMessage).catch(() => {
      console.log('收到新评论，但发送邮件通知失败');
    });

    return newComment;
  }

  /**
   * 查询所有评论
   * 额外添加文章信息
   */
  async findAll(): Promise<Comment[]> {
    const data = await this.commentRepository.find({
      order: { createAt: 'DESC' },
    });
    // for (let d of data) {
    //   const article = await this.articleService.findById(d.articleId);
    //   Object.assign(d, { article });
    // }
    return data;
  }

  /**
   * 获取指定评论
   * @param id
   */
  async findById(id): Promise<Comment> {
    return this.commentRepository.findOne(id);
  }

  /**
   * 获取文章评论
   * @param articleId
   */
  async getArticleComments(articleId) {
    const data = await this.commentRepository
      .createQueryBuilder('comment')
      .where('comment.articleId=:articleId')
      .andWhere('comment.pass=:pass')
      .setParameter('articleId', articleId)
      .setParameter('pass', true)
      .getMany();

    return buildTree(data);
  }

  async findByIds(ids): Promise<Array<Comment>> {
    return this.commentRepository.findByIds(ids);
  }

  /**
   * 更新评论
   * @param id
   * @param tag
   */
  async updateById(id, data: Partial<Comment>): Promise<Comment> {
    const old = await this.commentRepository.findOne(id);
    const newData = await this.commentRepository.merge(old, data);
    return this.commentRepository.save(newData);
  }

  async deleteById(id) {
    const tag = await this.commentRepository.findOne(id);
    return this.commentRepository.remove(tag);
  }
}
