const Util = require('../index');
const PathUtil = require('../path');
const d3Timer = require('d3-timer');
const d3Ease = require('d3-ease');
const { interpolate, interpolateArray } = require('d3-interpolate'); // 目前整体动画只需要数值和数组的差值计算

const Timeline = function() {
  // 待执行动画的队列
  this._animators = [];
  // 当前时间
  this._current = 0;
  // 计时器实例
  this._timer = null;
};

function _update(self, animator, ratio) {
  const cProps = {}; // 此刻属性
  const toAttrs = animator.toAttrs;
  const fromAttrs = animator.fromAttrs;
  const toMatrix = animator.toMatrix;
  if (self.get('destroyed')) {
    return;
  }
  let interf; //  差值函数
  for (const k in toAttrs) {
    if (!Util.isEqual(fromAttrs[k], toAttrs[k])) {
      if (k === 'path') {
        const toPath = PathUtil.parsePathString(toAttrs[k]); // 终点状态
        const fromPath = PathUtil.parsePathString(fromAttrs[k]); // 起始状态
        cProps[k] = [];
        for (let i = 0; i < toPath.length; i++) {
          const toPathPoint = toPath[i];
          const fromPathPoint = fromPath[i];
          const cPathPoint = [];
          for (let j = 0; j < toPathPoint.length; j++) {
            if (Util.isNumber(toPathPoint[j]) && fromPathPoint) {
              interf = interpolate(fromPathPoint[j], toPathPoint[j]);
              cPathPoint.push(interf(ratio));
            } else {
              cPathPoint.push(toPathPoint[j]);
            }
          }
          cProps[k].push(cPathPoint);
        }
      } else {
        interf = interpolate(fromAttrs[k], toAttrs[k]);
        cProps[k] = interf(ratio);
      }
    }
  }
  if (toMatrix) {
    const mf = interpolateArray(animator.fromMatrix, toMatrix);
    const cM = mf(ratio);
    self.setMatrix(cM);
  }
  self.attr(cProps);
}

function update(shape, animator, elapsed) {
  const startTime = animator.startTime;
  // 如果还没有开始执行或暂停，先不更新
  if (elapsed < (startTime + animator.delay) || animator.isPaused) {
    return false;
  }
  let ratio;
  let isFinished = false;
  const duration = animator.duration;
  const easing = animator.easing;
  // 已执行时间
  elapsed = elapsed - startTime - animator.delay;
  if (animator.toAttrs.repeat) {
    ratio = (elapsed % duration) / duration;
    ratio = d3Ease[easing](ratio);
  } else {
    ratio = elapsed / duration;
    if (ratio < 1) {
      ratio = d3Ease[easing](ratio);
    } else {
      ratio = 1;
      if (animator.callback) {
        animator.callback();
      }
      isFinished = true;
    }
  }
  _update(shape, animator, ratio);
  return isFinished;
}

Util.augment(Timeline, {
  initTimer() {
    const self = this;
    let isFinished = false;
    let shape,
      animators,
      animator,
      canvas;
    self._timer = d3Timer.timer(elapsed => {
      self._current = elapsed;
      if (this._animators.length > 0) {
        for (let i = this._animators.length - 1; i >= 0; i--) {
          shape = this._animators[i];
          if (shape.get('destroyed')) {
            // 如果已经被销毁，直接移出队列
            self.removeAnimator(i);
            continue;
          }
          if (!canvas) {
            canvas = shape.get('canvas');
          }
          if (!shape.get('pause').isPaused) {
            animators = shape.get('animators');
            for (let j = animators.length - 1; j >= 0; j--) {
              animator = animators[j];
              isFinished = update(shape, animator, elapsed);
              if (isFinished) {
                animators.splice(j, 1);
                isFinished = false;
              }
            }
          }
          if (animators.length === 0) {
            self.removeAnimator(i);
          }
        }
        if (canvas) {
          canvas.draw();
        }
      }
    });
  },
  addAnimator(shape) {
    this._animators.push(shape);
  },
  removeAnimator(index) {
    this._animators.splice(index, 1);
  },
  clear() {
    this._animators = [];
  },
  isAnimating() {
    return !!this._animators.length;
  },
  getTime() {
    return this._current;
  }
});

module.exports = Timeline;
