package com.example.memecard.data

import kotlin.random.Random

/**
 * 洗牌袋（shuffle bag）。
 *
 * 为什么不用 `Random.nextInt(size)`：
 * 纯随机会连续抽到同一个梗，50 个里有几个可能很久都轮不到。
 * 这里把全部下标打乱后依次取出，取完才重洗。
 *
 * 效果：
 * - 一轮之内不会重复
 * - 所有梗都能轮到
 * - 新一轮的第一个尽量不接上一轮的最后一个
 *
 * [random] 可注入，便于用固定种子写测试。
 */
class MemeDeck(private val random: Random = Random.Default) {

    private var order: List<Int> = emptyList()
    private var cursor: Int = 0
    private var lastServed: Int = -1

    /** 数据条数变化或重新同步后调用。 */
    fun reset() {
        order = emptyList()
        cursor = 0
        lastServed = -1
    }

    /** 返回下一个下标；[size] <= 0 时返回 -1。 */
    fun next(size: Int): Int {
        if (size <= 0) return -1
        if (order.size != size || cursor >= order.size) {
            reshuffle(size)
        }
        val index = order[cursor++]
        lastServed = index
        return index
    }

    private fun reshuffle(size: Int) {
        val shuffled = (0 until size).shuffled(random)
        // 新一轮的开头和上一轮的结尾撞了，就和第二个换一下
        order = if (size > 1 && shuffled.first() == lastServed) {
            shuffled.toMutableList().also {
                val head = it[0]
                it[0] = it[1]
                it[1] = head
            }
        } else {
            shuffled
        }
        cursor = 0
    }
}
