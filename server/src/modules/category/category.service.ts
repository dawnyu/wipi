import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './Category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>
  ) {}

  /**
   * 添加分类
   * @param Category
   */
  async create(Category: Partial<Category>): Promise<Category> {
    const { label } = Category;
    const existCategory = await this.categoryRepository.findOne({
      where: { label },
    });

    if (existCategory) {
      throw new HttpException('分类已存在', HttpStatus.BAD_REQUEST);
    }

    const newCategory = await this.categoryRepository.create(Category);
    await this.categoryRepository.save(newCategory);
    return newCategory;
  }

  /**
   * 获取所有分类
   */
  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find({ order: { createAt: 'ASC' } });
  }

  /**
   * 获取指定分类
   * @param id
   */
  async findById(id): Promise<Category> {
    return this.categoryRepository.findOne(id);
  }

  async findByIds(ids): Promise<Array<Category>> {
    return this.categoryRepository.findByIds(ids);
  }

  /**
   * 更新分类
   * @param id
   * @param Category
   */
  async updateById(id, category: Partial<Category>): Promise<Category> {
    const oldCategory = await this.categoryRepository.findOne(id);
    const updatedCategory = await this.categoryRepository.merge(
      oldCategory,
      category
    );
    return this.categoryRepository.save(updatedCategory);
  }

  /**
   * 删除分类
   * @param id
   */
  async deleteById(id) {
    const category = await this.categoryRepository.findOne(id);
    return this.categoryRepository.remove(category);
  }
}